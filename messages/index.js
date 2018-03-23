'use strict';

const builder = require('botbuilder');
const botbuilder_azure = require('botbuilder-azure');
const path = require('path');

let useEmulator = (process.env.NODE_ENV === 'development');
useEmulator = true;

const connector = useEmulator ? new builder.ChatConnector() : new botbuilder_azure.BotServiceConnector({
	appId: process.env['MicrosoftAppId'],
	appPassword: process.env['MicrosoftAppPassword'],
	openIdMetadata: process.env['BotOpenIdMetadata']
});

const bot = new builder.UniversalBot(connector);
bot.localePath(path.join(__dirname, './locale'));

// Make sure you add code to validate these fields
const luisAppId = process.env.LuisAppId;
const luisAPIKey = process.env.LuisAPIKey;
const luisAPIHostName = process.env.LuisAPIHostName || 'westus.api.cognitive.microsoft.com';

const LuisModelUrl = 'https://' + luisAPIHostName + '/luis/v1/application?id=' + luisAppId + '&subscription-key=' + luisAPIKey;

// Main dialog with LUIS
const recognizer = new builder.LuisRecognizer(LuisModelUrl);
const intents = new builder.IntentDialog({recognizers: [recognizer]})
	.matches('Greeting', (session) => {
		session.send('!!You reached Greeting intent, you said \'%s\'.', session.message.text);
	})
	.matches('Help', (session) => {
		session.send('You reached Help intent, you said \'%s\'.', session.message.text);
	})
	.matches('Cancel', (session) => {
		session.send('You reached Cancel intent, you said \'%s\'.', session.message.text);
	})
	/*
	.matches('<yourIntent>')... See details at http://docs.botframework.com/builder/node/guides/understanding-natural-language/
	*/
	.onDefault((session) => {
		session.send('Sorry, I did not understand \'%s\'.', session.message.text);
	});


// https://westus.api.cognitive.microsoft.com/luis/v2.0/apps/9cfb77bc-f570-4d4e-a138-21748defb3af?subscription-key=f1497b363d484310830cf4fb46e71472&verbose=false&q=hi

// let bot = new builder.UniversalBot(connector, function (session) {
//     session.send("You said: %s", session.message.text);
// });

bot.dialog('/', intents);

if (useEmulator) {
	const restify = require('restify');
	const server = restify.createServer();
	server.listen(3978, function () {
		console.log('test bot endpoint at http://localhost:3978/api/messages');
	});
	server.post('/api/messages', connector.listen());
} else {
	module.exports = connector.listen();
}

