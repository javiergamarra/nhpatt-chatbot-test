'use strict';
const builder = require('botbuilder');
const botbuilder_azure = require('botbuilder-azure');
const path = require('path');

const useEmulator = (process.env.NODE_ENV === 'development');

const connector = useEmulator ? new builder.ChatConnector() : new botbuilder_azure.BotServiceConnector({
    appId: process.env['MicrosoftAppId'],
    appPassword: process.env['MicrosoftAppPassword'],
    openIdMetadata: process.env['BotOpenIdMetadata']
});

// const tableName = 'botdata';
// const azureTableClient = new botbuilder_azure.AzureTableClient(tableName, process.env['AzureWebJobsStorage']);
// const tableStorage = new botbuilder_azure.AzureBotStorage({gzipData: false}, azureTableClient);

const bot = new builder.UniversalBot(connector);
bot.localePath(path.join(__dirname, './locale'));
// bot.set('storage', tableStorage);

const luisAppId = process.env.LuisAppId;
const luisAPIKey = process.env.LuisAPIKey;
const luisAPIHostName = process.env.LuisAPIHostName || 'westeurope.api.cognitive.microsoft.com';

console.log(luisAppId, luisAPIKey, luisAPIHostName);

const LuisModelUrl = 'https://' + luisAPIHostName + '/luis/v1/application?id=' + luisAppId + '&subscription-key=' + luisAPIKey;

const recognizer = new builder.LuisRecognizer(LuisModelUrl);
const intents = new builder.IntentDialog({recognizers: [recognizer]})
    .matches('Greeting', (session) => {

        const welcome = 'Te damos la bienvenida a Liferay Mutual! ¿Cómo puedo ayudarte?';
        session.send(welcome);

        session.send('Hola, te puedo preguntar cómo te llamas?');

        session.send('Encantado de conocerte \'%s\', ¿en qué puedo ayudarte? :-)', session.message.text);

        session.send('Me alegra que me hagas esa pregunta, tenemos los mejores seguros de coches del mercado.');
        session.send('Disponemos de cuatro tipos de seguro de coche: Todo riesgo, a terceros, con franquicia y para coches clásicos.');
        session.send('Esta es la página donde podrás encontrar toda la información: http://liferay-gs-ci:8888/web/liferay-mutual/car-insurance/third-party-insurance');
        session.send('Has encontrado algo que cuadre con lo que buscas?');

        session.send('Encantado de haberte ayudado Sara! :-D');
        session.send('No me gustaría que me hiciesen chatarra! :-O ¿me ayudas con una buena valoración? Del 1 al 5, siendo 1 muy poco satisfecho :-( y 5 muuuuy satisfecho :-)');

        session.send(':-D :-D Muchas gracias!');
    })
    .matches('Help', (session) => {
        session.send('!!!You reached Help intent, you said \'%s\'.', session.message.text);
    })
    .matches('Cancel', (session) => {
        session.send('!!!You reached Cancel intent, you said \'%s\'.', session.message.text);
    })
    .onDefault((session) => {
        session.send('Sorry, I did not understand \'%s\'.', session.message.text);
    });

bot.dialog('/', intents);

// bot.dialog('adhocDialog', function (session, args) {
//     const message = 'Hello user, good to meet you! I now know your address and can send you notifications in the future.';
//     session.send(message);
// });

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

