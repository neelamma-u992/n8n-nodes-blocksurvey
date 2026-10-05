import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

type BlockSurveyContext = IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions | IWebhookFunctions;

export const CREDENTIAL_NAME = 'blockSurveyOAuth2Api';

const API_BASE_URLS: Record<string, string> = {
	production: 'https://webservice.blocksurvey.io/n8n',
	development: 'https://blocksurvey-api-function-dev.onrender.com/n8n',
	local: 'http://localhost:8080/n8n',
};

/** Calls blocksurvey-api-function /n8n/* with the connection's OAuth token. */
export async function blockSurveyApiRequest(
	this: BlockSurveyContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
	qs: IDataObject = {},
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const baseUrl = API_BASE_URLS[(credentials.environment as string) || 'production'] || API_BASE_URLS.production;

	const options: IHttpRequestOptions = {
		method,
		url: baseUrl + endpoint,
		qs,
		json: true,
	};
	if (method !== 'GET' && method !== 'DELETE') {
		options.body = body;
	}

	try {
		return await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL_NAME, options);
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

export async function getWorkspaceOptions(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const workspaces = (await blockSurveyApiRequest.call(this, 'GET', '/workspaces')) as Array<{ id: string; name: string }>;
	return (workspaces || []).map((workspace) => ({ name: workspace.name, value: workspace.id }));
}

/**
 * Turns the BlockSurvey webhook payload into one flat item, keyed by question title like the
 * Zapier trigger: { response_id, survey_id, survey_title, submitted_at, "<Question>": answer, ... }.
 * Repeated titles get " (2)", " (3)". The raw answers stay under answers_by_question_id.
 */
export function flattenResponse(payload: IDataObject): IDataObject {
	const surveyResponse = (payload.survey_response || {}) as IDataObject;
	const definition = (surveyResponse.definition || {}) as IDataObject;
	const answers = (surveyResponse.answers || {}) as IDataObject;
	const fields = (definition.fields || []) as Array<{ id: string; title?: string }>;

	const item: IDataObject = {
		response_id: payload.event_id,
		survey_id: definition.id,
		survey_title: definition.title,
		submitted_at: answers.submitted_at ?? null,
	};

	fields.forEach((field) => {
		if (!field || !field.id || field.id === 'submitted_at') {
			return;
		}
		const baseKey = (field.title || field.id).trim() || field.id;
		let key = baseKey;
		let suffix = 2;
		while (Object.prototype.hasOwnProperty.call(item, key)) {
			key = `${baseKey} (${suffix++})`;
		}
		item[key] = answers[field.id] ?? null;
	});

	item.answers_by_question_id = answers;
	return item;
}
