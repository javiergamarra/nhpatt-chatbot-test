'use strict';
const builder = require('botbuilder');
const botbuilder_azure = require('botbuilder-azure');
const path = require('path');
const request = require('request');

const locale = 'en_US';
const localhost = process.env.NODE_ENV === 'localhost';
const username = localhost ? 'test@liferay.com' : 'test';
const password = 'test';
const host = (localhost ? 'http://localhost:8080' : 'http://liferay-gs-ci:8888') + '/api/jsonws/';

const useEmulator = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'localhost';

const locationDialog = require('botbuilder-location');

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
bot.library(locationDialog.createLibrary(process.env.BING_MAP || ''));

const luisAppId = process.env.LuisAppId;
const luisAPIKey = process.env.LuisAPIKey;
const luisAPIHostName = process.env.LuisAPIHostName || 'westus.api.cognitive.microsoft.com'; //'westeurope.api.cognitive.microsoft.com';

const LuisModelUrl = 'https://' + luisAPIHostName + '/luis/v1/application?id=' + luisAppId + '&subscription-key=' + luisAPIKey;

const recognizer = new builder.LuisRecognizer(LuisModelUrl);
const intents = new builder.IntentDialog({recognizers: [recognizer]})
    .onBegin(function (session) {
        session.send('Te damos la bienvenida a Liferay Mutual! ¿Cómo puedo ayudarte?');
    })
    .matches('Greeting', [(session) => {
        builder.Prompts.text(session, 'Hola, te puedo preguntar cómo te llamas?');
    }, (session, results) => {
        session.send('Encantado de conocerte \'%s\', ¿en qué puedo ayudarte? 😊😊', session.message.text);
    }])
    .matches('Help', (session) => {
        session.send('!!!You reached Help intent, you said \'%s\'.', session.message.text);
    })
    .matches('Parte', [
        (session, results, next) => {

            session.send('¿Me puedes decir sobre qué tipo de seguro quieres dar de alta un parte?');

            const callback = (err, result) => {

                let random = '' + Math.random();

                session.userData.form = {};

                let arr = result.fields.map(field =>
                    (session, results) => {

                        if (session.userData.lastField) {
                            session.userData.form[session.userData.lastField] = results && results.response;
                        }
                        session.userData.lastField = field.name;

                        if ('select' === (field.type)) {
                            let choices = field.options.map(x => x.value);
                            builder.Prompts.choice(session, field.label, choices);
                        } else if ('date' === (field.dataType)) {
                            builder.Prompts.time(session, field.label)
                        } else if ('document-library' === (field.dataType)) {
                            builder.Prompts.attachment(session, field.label)
                        } else if ('geolocation' === (field.dataType)) {
                            locationDialog.getLocation(session, {
                                prompt: field.label,
                                requiredFields:
                                locationDialog.LocationRequiredFields.locality
                            });
                        } else {
                            builder.Prompts.text(session, field.label[locale]);
                        }
                    }
                );

                bot.dialog(random, arr);

                session.beginDialog(random);
            };

            const asyncFun = (error, response, body) => {
                let processStructure1 = processStructure(error, response, body);
                callback(null, processStructure1);
            };

            post('ddm.ddmstructure/get-structure', {'structureId': 157436}, asyncFun);
        },
        (session, results, next) => {

            console.log(JSON.stringify(session.userData.form));

            post('ddl.ddlrecord/add-record',
                {
                    groupId: 20152,
                    recordSetId: 157439,
                    displayIndex: 0,
                    fieldsMap: JSON.stringify(session.userData.form)
                },
                processNewRecord);

            session.send('¿Has tenido un accidente de tráfico?');
            next();
        },
        (session, results, next) => {
            session.send('Ok, no te preocupes de nada, en un par de minutos habremos acabado. ;-)');
            next();
        },
        (session, results, next) => {
            session.send('Ya hemos terminado Carlos, espero que haya sido rápido.');
            session.send('Muchas gracias por la paciencia! En breve recibirás un correo electrónico con el acuse de recibo del alta del parte. Además podrás consultar su estado desde la página web o desde app, en el apartado de "Incidences".');
            session.send('Recuerda que para cualquier duda estamos disponibles en el teléfono 666999999.');
            session.send('Aunque soy un robot tengo mi corazoncito! :-) ¿me ayudas con una buena valoración? Del 1 al 5, siendo 1 muy poco satisfecho :-( y 5 muuuuy satisfecho :-)');
            session.send('Nos vemos pronto!! :-)');
            next();
        },
    ])
    .matches('Seguros', [
        (session) => {
            session.send('Me alegra que me hagas esa pregunta, tenemos los mejores seguros de coches del mercado.');
            session.send('Disponemos de cuatro tipos de seguro de coche: Todo riesgo, a terceros, con franquicia y para coches clásicos.');
            session.send('Esta es la página donde podrás encontrar toda la información: http://liferay-gs-ci:8888/web/liferay-mutual/car-insurance/third-party-insurance');
            session.send();
            builder.Prompts.confirm(session, 'Has encontrado algo que cuadre con lo que buscas?', [{prompt: 'Sí'}, {prompt: 'No'}])
        },
        (session, results) => {
            session.send('Encantado de haberte ayudado Sara! :-D');
            session.send('No me gustaría que me hiciesen chatarra! :-O ¿me ayudas con una buena valoración? Del 1 al 5, siendo 1 muy poco satisfecho :-( y 5 muuuuy satisfecho :-)');
        },
        (session, results) => {
            session.send(':-D :-D Muchas gracias!');
        }
    ])
    .matches('Cancel', (session) => {
        session.send('You reached Cancel intent, you said \'%s\'.', session.message.text);
    })
    .onDefault((session) => {
        session.send('Sorry, I did not understand \'%s\'.', session.message.text);
    });

bot.dialog('/', intents);

bot.on('conversationUpdate', function (message) {
    if (message.membersAdded) {
        message.membersAdded.forEach(function (identity) {
            if (identity.id === message.address.bot.id) {
                bot.beginDialog(message.address, '/');
            }
        });
    }
});


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

function post(url, form, callback) {
    request
        .post(host + url, {form}, callback)
        .auth(username, password, true);
}

function processStructure(error, response, body) {
    const message = JSON.parse(body);
    return JSON.parse(message.definition);
}

function processNewRecord(error, response, body) {
    console.log('error:', error);
    console.log('body:', body);
}