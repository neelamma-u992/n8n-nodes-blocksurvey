import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes } from 'n8n-workflow';

import { blockSurveyApiRequest, getWorkspaceOptions } from './GenericFunctions';

export class BlockSurvey implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'BlockSurvey',
		name: 'blockSurvey',
		icon: { light: 'file:../../icons/blocksurvey.svg', dark: 'file:../../icons/blocksurvey.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Add or update contacts in BlockSurvey contact lists',
		defaults: { name: 'BlockSurvey' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'blockSurveyOAuth2Api', required: true }],
		usableAsTool: true,
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [{ name: 'Contact', value: 'contact' }],
				default: 'contact',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['contact'] } },
				options: [
					{
						name: 'Create or Update',
						value: 'upsert',
						description: 'Create a new record, or update the current one if it already exists (upsert)',
						action: 'Create or update a contact',
					},
				],
				default: 'upsert',
			},
			{
				displayName: 'Workspace Name or ID',
				name: 'workspaceId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getWorkspaces' },
				default: '',
				required: true,
				displayOptions: { show: { resource: ['contact'], operation: ['upsert'] } },
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Contact List Name or ID',
				name: 'listId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getLists', loadOptionsDependsOn: ['workspaceId'] },
				default: '',
				required: true,
				displayOptions: { show: { resource: ['contact'], operation: ['upsert'] } },
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				required: true,
				displayOptions: { show: { resource: ['contact'], operation: ['upsert'] } },
				description: 'The contact is matched on this email address',
			},
			{
				displayName: 'Fields',
				name: 'fields',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['contact'], operation: ['upsert'] } },
				options: [
					{
						displayName: 'Field',
						name: 'field',
						values: [
							{
								displayName: 'Field Name or ID',
								name: 'key',
								type: 'options',
								typeOptions: { loadOptionsMethod: 'getListFields', loadOptionsDependsOn: ['listId'] },
								default: '',
								description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
							},
						],
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			getWorkspaces: getWorkspaceOptions,

			async getLists(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const workspaceId = this.getCurrentNodeParameter('workspaceId') as string;
				if (!workspaceId) {
					return [];
				}
				const lists = (await blockSurveyApiRequest.call(this, 'GET', '/lists', {}, { teamId: workspaceId })) as Array<{ id: string; name: string }>;
				return (lists || []).map((list) => ({ name: list.name, value: list.id }));
			},

			// Email has its own parameter, so it is left out here
			async getListFields(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const workspaceId = this.getCurrentNodeParameter('workspaceId') as string;
				const listId = this.getCurrentNodeParameter('listId') as string;
				if (!workspaceId || !listId) {
					return [];
				}
				const fields = (await blockSurveyApiRequest.call(this, 'GET', '/lists/fields', {}, { teamId: workspaceId, listId })) as Array<{ key: string; label: string }>;
				return (fields || [])
					.filter((field) => field.key !== 'email')
					.map((field) => ({ name: field.label, value: field.key }));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const workspaceId = this.getNodeParameter('workspaceId', itemIndex) as string;
				const listId = this.getNodeParameter('listId', itemIndex) as string;
				const email = this.getNodeParameter('email', itemIndex) as string;
				const fieldEntries = (this.getNodeParameter('fields.field', itemIndex, []) as Array<{ key: string; value: string }>) || [];

				const fields: IDataObject = {};
				fieldEntries.forEach((entry) => {
					if (entry.key) {
						fields[entry.key] = entry.value;
					}
				});

				const response = (await blockSurveyApiRequest.call(this, 'POST', '/contacts', {
					teamId: workspaceId,
					listId,
					email,
					fields,
				})) as IDataObject;

				returnData.push({ json: response, pairedItem: { item: itemIndex } });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: itemIndex } });
					continue;
				}
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex });
			}
		}

		return [returnData];
	}
}
