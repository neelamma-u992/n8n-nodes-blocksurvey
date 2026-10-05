import type {
	IDataObject,
	IHookFunctions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { blockSurveyApiRequest, flattenResponse, getWorkspaceOptions } from './GenericFunctions';

export class BlockSurveyTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'BlockSurvey Trigger',
		name: 'blockSurveyTrigger',
		icon: { light: 'file:../../icons/blocksurvey.svg', dark: 'file:../../icons/blocksurvey.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: 'New survey response',
		description: 'Starts the workflow when a BlockSurvey survey receives a new response',
		defaults: { name: 'BlockSurvey Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'blockSurveyOAuth2Api', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Workspace Name or ID',
				name: 'workspaceId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getWorkspaces' },
				default: '',
				required: true,
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Survey Name or ID',
				name: 'surveyId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getSurveys', loadOptionsDependsOn: ['workspaceId'] },
				default: '',
				required: true,
				description: 'Only live surveys are listed. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
		],
	};

	methods = {
		loadOptions: {
			getWorkspaces: getWorkspaceOptions,

			async getSurveys(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const workspaceId = this.getCurrentNodeParameter('workspaceId') as string;
				if (!workspaceId) {
					return [];
				}
				const surveys = (await blockSurveyApiRequest.call(this, 'GET', '/surveys', {}, { teamId: workspaceId })) as Array<{ id: string; name: string }>;
				return (surveys || []).map((survey) => ({ name: survey.name, value: survey.id }));
			},
		},
	};

	// REST hook: BlockSurvey stores the n8n webhook URL as a survey webhook and the
	// respondent's browser delivers each new response to it.
	webhookMethods = {
		default: {
			// Static data can outlive the hook (n8n does not always persist the clear in delete()),
			// so ask BlockSurvey whether the stored hook still exists for this URL and survey.
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				const workspaceId = this.getNodeParameter('workspaceId') as string;
				const surveyId = this.getNodeParameter('surveyId') as string;
				if (!webhookData.webhookId || webhookData.workspaceId !== workspaceId || webhookData.surveyId !== surveyId) {
					return false;
				}
				try {
					const hook = (await blockSurveyApiRequest.call(this, 'GET', `/hooks/responses/${webhookData.webhookId}`, {}, {
						teamId: workspaceId,
						surveyId,
					})) as IDataObject;
					return !!hook && hook.url === this.getNodeWebhookUrl('default');
				} catch (error) {
					// Hook missing or not ours: report it as gone so n8n creates a new one
					this.logger.debug('BlockSurvey hook lookup failed, re-creating it', { error: (error as Error).message });
					return false;
				}
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				const workspaceId = this.getNodeParameter('workspaceId') as string;
				const surveyId = this.getNodeParameter('surveyId') as string;

				const response = (await blockSurveyApiRequest.call(this, 'POST', '/hooks/responses', {
					teamId: workspaceId,
					surveyId,
					hookUrl: this.getNodeWebhookUrl('default'),
					zapName: this.getWorkflow().name || '',
				})) as IDataObject;

				if (!response || !response.id) {
					return false;
				}
				webhookData.webhookId = response.id;
				webhookData.workspaceId = workspaceId;
				webhookData.surveyId = surveyId;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				if (webhookData.webhookId) {
					try {
						await blockSurveyApiRequest.call(this, 'DELETE', `/hooks/responses/${webhookData.webhookId}`, {}, {
							teamId: webhookData.workspaceId as string,
							surveyId: webhookData.surveyId as string,
						});
					} catch (error) {
						// Already removed on the BlockSurvey side (e.g. connection revoked)
						this.logger.warn('BlockSurvey hook could not be removed', { error: (error as Error).message });
					}
				}
				delete webhookData.webhookId;
				delete webhookData.workspaceId;
				delete webhookData.surveyId;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const body = this.getBodyData() as IDataObject;
		return {
			workflowData: [this.helpers.returnJsonArray([flattenResponse(body)])],
		};
	}
}
