import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

// BlockSurvey is the OAuth provider (blocksurvey-api-function /n8n/*). n8n is a public client:
// there is no client secret, and PKCE proves the token request comes from the instance that
// started the sign-in. Client ids are public identifiers, not secrets.
const DEV_CLIENT_ID = '0e15186d363234ec95f3c471bb9a00e1';
// N8N_CLIENT_ID of the production backend (webservice.blocksurvey.io)
const PROD_CLIENT_ID = '9a757f4c77e56ff96fddac7c6ef151da';

const env = '$self["environment"]';
// Picks a value per environment inside an n8n expression
const byEnv = (production: string, development: string, local: string) =>
	`={{ ${env} === "local" ? "${local}" : ${env} === "development" ? "${development}" : "${production}" }}`;

export class BlockSurveyOAuth2Api implements ICredentialType {
	name = 'blockSurveyOAuth2Api';

	extends = ['oAuth2Api'];

	displayName = 'BlockSurvey OAuth2 API';

	icon: Icon = { light: 'file:../icons/blocksurvey.svg', dark: 'file:../icons/blocksurvey.dark.svg' };

	documentationUrl = 'https://blocksurvey.io';

	properties: INodeProperties[] = [
		{
			displayName: 'Environment',
			name: 'environment',
			type: 'options',
			options: [
				{ name: 'Production', value: 'production' },
				{ name: 'Development', value: 'development' },
				{ name: 'Local', value: 'local' },
			],
			default: 'production',
			description: 'Development and Local sign in on localhost:4200; Local also uses the backend on localhost:8080',
		},
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'pkce',
		},
		{
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'hidden',
			default: byEnv('https://blocksurvey.io/n8n/authorize', 'http://localhost:4200/n8n/authorize', 'http://localhost:4200/n8n/authorize'),
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: byEnv(
				'https://webservice.blocksurvey.io/n8n/oauth/token',
				'https://blocksurvey-api-function-dev.onrender.com/n8n/oauth/token',
				'http://localhost:8080/n8n/oauth/token',
			),
		},
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'hidden',
			default: byEnv(PROD_CLIENT_ID, DEV_CLIENT_ID, DEV_CLIENT_ID),
		},
		{
			displayName: 'Client Secret',
			name: 'clientSecret',
			type: 'hidden',
			typeOptions: { password: true },
			default: '',
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'body',
		},
	];
}
