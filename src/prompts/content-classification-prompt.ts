export interface ClassificationPromptInput {
	title: string | null;
	author: string | null;
	publishDate: string | null;
	bodyText: string;
}

export function buildContentClassificationPrompt(input: ClassificationPromptInput): string {
	return `
You are a content classification assistant.

Classify the article into one of these categories:
- technology
- business
- science
- health
- sports
- politics
- entertainment
- other

Return:
1) category
2) summary (2-3 concise sentences)
3) confidenceScore (0 to 1)

Article title: ${input.title ?? "Unknown"}
Author: ${input.author ?? "Unknown"}
Publish date: ${input.publishDate ?? "Unknown"}
Body:
${input.bodyText}
`;
}
