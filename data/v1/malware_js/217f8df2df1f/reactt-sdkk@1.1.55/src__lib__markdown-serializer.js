export const serializeToMarkdown = (json) => {
    if (!json || !json.content) return '';

    const serializeNode = (node) => {
        let text = '';

        if (node.type === 'text') {
            text = node.text || '';
            if (node.marks) {
                node.marks.forEach((mark) => {
                    // Extract leading/trailing whitespaces
                    const leadingSpace = text.match(/^\s*/)[0];
                    const trailingSpace = text.match(/\s*$/)[0];
                    const trimmedText = text.trim();

                    if (!trimmedText) return; // Don't apply marks to empty/whitespace-only strings

                    switch (mark.type) {
                        case 'bold':
                            text = `${leadingSpace}**${trimmedText}**${trailingSpace}`;
                            break;
                        case 'italic':
                            text = `${leadingSpace}*${trimmedText}*${trailingSpace}`;
                            break;
                        case 'strike':
                            text = `${leadingSpace}~~${trimmedText}~~${trailingSpace}`;
                            break;
                        case 'code':
                            text = `${leadingSpace}\`${trimmedText}\`${trailingSpace}`;
                            break;
                        case 'link':
                            text = `${leadingSpace}[${trimmedText}](${mark.attrs.href})${trailingSpace}`;
                            break;
                    }
                });
            }
            return text;
        }

        const children = node.content ? node.content.map(serializeNode).join('') : '';

        switch (node.type) {
            case 'paragraph':
                return `${children}\n\n`;
            case 'heading':
                return `${'#'.repeat(node.attrs.level)} ${children}\n\n`;
            case 'bulletList':
                return node.content
                    .map((item) => `- ${serializeNode(item).trim()}\n`)
                    .join('') + '\n';
            case 'orderedList':
                return node.content
                    .map((item, index) => `${index + 1}. ${serializeNode(item).trim()}\n`)
                    .join('') + '\n';
            case 'listItem':
                // list items content is usually paragraph, so we strip the last newline
                return children.replace(/\n\n$/, '');
            case 'codeBlock':
                return `\`\`\`${node.attrs.language || ''}\n${node.content[0].text}\n\`\`\`\n\n`;
            case 'blockquote':
                return `> ${children.replace(/\n\n/g, '\n> ')}\n\n`;
            case 'hardBreak':
                return '\n';
            case 'image':
                return `![${node.attrs.alt || ''}](${node.attrs.src})\n\n`;
            default:
                return children;
        }
    };

    return json.content.map(serializeNode).join('').trim();
};
