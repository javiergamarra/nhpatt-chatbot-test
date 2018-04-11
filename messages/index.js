'use strict';

const builder = require('botbuilder');
const botbuilder_azure = require('botbuilder-azure');
const request = require('request');
const locationDialog = require('botbuilder-location');
require('request-to-curl');

const locale = 'es_ES';
const localhost = process.env.NODE_ENV === 'localhost';
const username = localhost ? 'test@liferay.com' : 'test';
const password = 'test';
const host = (localhost ? 'http://localhost:8080' : process.env.URL) + '/api/jsonws/';

console.log(username, host);

const useEmulator = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'localhost';


const connector = useEmulator ? new builder.ChatConnector() : new botbuilder_azure.BotServiceConnector({
    appId: process.env['MicrosoftAppId'],
    appPassword: process.env['MicrosoftAppPassword'],
    openIdMetadata: process.env['BotOpenIdMetadata']
});

const bot = new builder.UniversalBot(connector, {
    localizerSettings: {
        defaultLocale: 'es',
        botLocalePath: './locale'
    }
});

// const tableName = 'botdata';
// const azureTableClient = new botbuilder_azure.AzureTableClient(tableName, process.env['AzureWebJobsStorage']);
// const tableStorage = new botbuilder_azure.AzureBotStorage({gzipData: false}, azureTableClient);
// bot.set('storage', tableStorage);

const lib = locationDialog.createLibrary(process.env.BING_MAP || '');
bot.library(lib);

bot.dialog('survey', [
    (session) => {
        setTimeout(function () {
            builder.Prompts.number(session, 'No me gustaría que me hiciesen chatarra! 😯 ¿me ayudas con una buena valoración? Del 1 al 5, siendo 1 muy poco satisfecho 😞 y 5 muuuuy satisfecho 😊');
        }, 3000);
    },
    (session, results, next) => {
        session.userData.valoration = results.response;
        let review = results.response < 3 ? '😞' : '😊';
        session.send(review + ' Muchas gracias!');
        next();
    }
]);

const luisAppId = process.env.LuisAppId;
const luisAPIKey = process.env.LuisAPIKey;
const luisAPIHostName = process.env.LuisAPIHostName || 'westus.api.cognitive.microsoft.com'; //'westeurope.api.cognitive.microsoft.com';

const LuisModelUrl = 'https://' + luisAPIHostName + '/luis/v1/application?id=' + luisAppId + '&subscription-key=' + luisAPIKey;

const recognizer = new builder.LuisRecognizer(LuisModelUrl);

const intents = new builder.IntentDialog({recognizers: [recognizer]})
    .onBegin(function (session) {

        session.conversationData.name = '';

        session.send(
            [
                'Te damos la bienvenida a Liferay Mutual! ¿Cómo puedo ayudarte?',
                'Hola! ¿Cómo puedo ayudarte?',
            ]
        );

        session.preferredLocale('es', function (err) {
            if (err) {
                session.error(err);
            }
        });
    })
    .matches('Greeting', [
        (session, results, next) => {
            if (session.conversationData.name) {
                next();
            } else {
                builder.Prompts.text(session, 'Hola, te puedo preguntar cómo te llamas?');
            }
        },
        (session) => {
            if (!session.conversationData.name) {
                session.conversationData.name = session.message.text;
            }
            session.send([
                'Encantado de conocerte %s, ¿en qué puedo ayudarte? 😊',
                'Hola %s, bienvenido a Liferay Mutual. ¿En qué puedo ayudarte? 😊'
            ], session.conversationData.name);

            session.send('A día de hoy, te puedo decir que seguros puedes contratar o dar un parte');

        }])
    .matches('Help', (session) => {
        session.send('Has pedido ayuda... \'%s\'.', session.message.text);
    })
    .matches('Parte', [
        (session, results, next) => {

            if (results.entities && results.entities.length) {
                session.send('Ok, entendido, un parte de %s', results.entities[0].entity);
                next();
            } else {
                builder.Prompts.text(session, '¿Me puedes decir sobre qué tipo de seguro quieres dar de alta un parte?');
            }
        },
        (session) => {
            builder.Prompts.confirm(session, '¿Has tenido un accidente de tráfico?');
        },
        (session, results) => {


            session.send('Ok, no te preocupes de nada, en un par de minutos habremos acabado. 😉');
            session.send('Vamos a hacerte una serie de preguntas para poder ayudarte mejor');

            session.userData.type = results.response;

            const callback = (err, result) => {
                let random = '' + Math.random();

                session.userData.form = {};

                let arr = result.fields.map(field =>
                    (session, results, next) => {

                        const userData = session.userData;
                        if (userData.lastField && results && results.response) {
                            processResults(session, results.response, () => next());
                        }

                        const dialogDatum = session.dialogData['BotBuilder.Data.WaterfallStep'] + 1;

                        if (dialogDatum === 2) {
                            session.send('Perfecto! Sin eso no habría podido darte de alta el parte :-J');
                        } else if (dialogDatum === 7) {
                            session.send('Gracias, ya estamos a punto de terminar.');
                        } else if (session.userData.lastField && session.userData.lastField.dataType === 'date' && session.message.text) {
                            if (session.message.text.toLowerCase() === 'hoy') {
                                session.send('En breve llegará la asistencia técnica a ayudarte. ' +
                                    'Recibirás una notificación al teléfono móvil en el que podrás ver el camino que sigue la grúa hasta que se encuentre contigo.');
                            } else {
                                session.send('En breve recibirás un correo electrónico con el acuse de recibo del alta del parte. ' +
                                    'Además podrás consultar su estado desde la página web o desde app, en el apartado de "Incidences"');
                            }
                        }

                        userData.lastField = field;

                        createPromptsAndDealWithSpecialCases(session, result, field);

                    }
                );

                bot.dialog(random, arr);

                session.beginDialog(random);
            };

            const asyncFun = (error, response, body) => {
                callback(null, processStructure(error, response, body));
            };

            post('ddm.ddmstructure/get-structure', {'structureId': 157436}, asyncFun);
        },
        (session, results) => {

            console.log(JSON.stringify(session.userData.form));

            processResults(session, results.response, () =>
                post('ddl.ddlrecord/add-record',
                    {
                        groupId: 20152,
                        recordSetId: 157439,
                        // recordSetId: 271054,
                        displayIndex: 0,
                        fieldsMap: JSON.stringify(session.userData.form)
                    },
                    processNewRecord
                )
            );

            session.send('Ya hemos terminado %s, espero que haya sido rápido.', session.conversationData.name);

            timeout(session,
                'Muchas gracias por la paciencia! En breve recibirás un correo electrónico con el ' +
                'acuse de recibo del alta del parte. Además podrás consultar su estado desde la página web' +
                ' o desde app, en el apartado de "Incidences".', 2000);

            timeout(session, [
                'Recuerda que para cualquier duda estamos disponibles en el teléfono 666999999.',
                'Si necesitas comunicar con nosotros durante la espara estamos disponibles en el teléfono 666999999 para cualquier consulta que requieras.',
                'Recuerda instalarte nuestra app!'
            ], 4000);

            let random = Math.random();

            if (random > 0.5) {
                setTimeout(function () {
                    session.beginDialog('survey');
                }, 5000);
            }
        },
        (session, results, next) => {
            timeout(session, 'Muchas gracias por la paciencia!', 2000);

            setTimeout(function () {
                session.send('Nos vemos pronto! 😊');
            }, 4000);

            next();
        }
    ])
    .matches('Seguros', [
        (session) => {

            timeout(session, 'Me alegra que me hagas esa pregunta, tenemos los mejores seguros de coches del mercado.', 1000);
            timeout(session, 'Disponemos de cuatro tipos de seguro de coche: Todo riesgo, a terceros, con franquicia y para coches clásicos.', 3000);
            timeout(session, 'Esta es la página donde podrás encontrar toda la información: http://liferay-gs.liferay.org.es/web/liferay-mutual/car-insurance/third-party-insurance', 5000);

            setTimeout(function () {
                builder.Prompts.choice(session, 'Has encontrado algo que cuadre con lo que buscas?', ['Si', 'No'])
            }, 7000);
        },
        (session) => {

            session.sendTyping();
            setTimeout(function () {
                session.send('Encantado de haberte ayudado %s! :-D', session.conversationData.name);
                session.sendTyping();
            }, 1000);

            setTimeout(function () {
                session.beginDialog('survey');
            }, 2000);
        },
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


function processResults(session, response, callback) {

    const userData = session.userData;
    const lastField = userData.lastField.name;

    if (response.geo) {
        // '{"latitude":40.38787898231359, "longitude":-3.7037189304828644}'
        userData.form[lastField] = '{\"latitude\":' + response.geo.latitude + ', \"longitude\":' + response.geo.longitude + '}';
    } else if (response.resolution) {
        //  "2018-04-03",
        const d = response.resolution.start;
        userData.form[lastField] = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    } else if (response.entity) {
        //"[\"Yes\"]",
        userData.form[lastField] = '[\"' + userData.lastField.options.filter(x => x.label[locale] === response.entity)[0].value + '\"]';
    } else if (Array.isArray(response)) {

        const file = response[0];

        // "{\"groupId\":20152, \"uuid\":\"ba2795ce-ebbb-d458-e7f1-5532d4c9ac2d\", \"version\":1, \"folderId\":184570, \"title\":20180403_142339_132}"

        session.send(JSON.stringify(file)); //DEBUG

        request({
            encoding: null,
            uri: file.contentUrl
        }, function (error, response, body) {
            post('dlapp/add-file-entry', {
                'repositoryId': 20152,
                'folderId': 184570,
                'sourceFileName': file.name,
                'mimeType': file.contentType,
                'title': file.name,
                'description': '-',
                'changeLog': '-',
                'bytes': '[' + [...body].toString() + ']',
            }, function processNewRecord(error, response, body) {
                console.log('error:', error);

                session.send(error); //DEBUG

                console.log('body:', body);

                session.send(JSON.stringify(body)); //DEBUG

                const obj = JSON.parse(body);

                userData.form[lastField] = '{' +
                    '\"groupId\":20152, ' +
                    '\"uuid":\"' + obj.uuid + '", ' +
                    '\"version\":1.0,' +
                    '\"folderId\":184570, ' +
                    '\"title\":' + obj.fileName + '}';
                callback();
            });
        });
    } else {
        userData.form[lastField] = response;
    }
}

function createPromptsAndDealWithSpecialCases(session, result, field) {
    const dialogDatum = session.dialogData['BotBuilder.Data.WaterfallStep'] + 1;

    const label = dialogDatum + '/' + result.fields.length + ' - ' + field.label[locale];

    if ('select' === (field.type)) {
        let choices = field.options.map(x => x.label[locale]);
        const choiceSynonyms = [
            {value: 'Sí', synonyms: ['Si', 'Sí', 'Yes']},
            {value: 'No', synonyms: ['No', 'Nop']}
        ];
        builder.Prompts.choice(session, label, choices.indexOf('Sí') !== -1 ? choiceSynonyms : choices);
    } else if ('date' === (field.dataType)) {
        builder.Prompts.time(session, label);
    } else if ('document-library' === (field.dataType)) {
        builder.Prompts.attachment(session, label)
    } else if ('geolocation' === (field.dataType)) {
        locationDialog.getLocation(session, {
            prompt: label,
            requiredFields:
            locationDialog.LocationRequiredFields.locality
        });
    } else {
        builder.Prompts.text(session, label);
    }
}

function post(url, form, callback) {
    request
        .post(host + url, {form}, callback)
        .auth(username, password, true);
}

function processStructure(error, response, body) {

    if (error) {
        console.log(error);
        return
    }

    const message = JSON.parse(body);
    return JSON.parse(message.definition);
}

function processNewRecord(error, response, body) {
    console.log('error:', error);
    console.log('body:', body);
}

function timeout(session, message, delay) {
    session.sendTyping();
    setTimeout(function () {
        session.send(message);
        session.sendTyping();
    }, delay);
}

lib.dialog('confirm-dialog', createDialog(), true);

function createDialog() {
    return createBaseDialog()
        .onBegin(function (session, args) {
            const confirmationPrompt = args.confirmationPrompt;
            session.send(confirmationPrompt).sendBatch();
        })
        .onDefault(function (session) {
            const message = parseBoolean(session.message.text);
            if (typeof message === 'boolean') {
                session.endDialogWithResult({response: {confirmed: message}});
                return;
            }
            session.send('InvalidYesNo').sendBatch();
        });
}

function createBaseDialog(options) {
    return new builder.IntentDialog(options)
        .matches(/^cancel$/i, function (session) {
            session.send(consts_1.Strings.CancelPrompt);
            session.endDialogWithResult({response: {cancel: true}});
        })
        .matches(/^help$/i, function (session) {
            session.send(consts_1.Strings.HelpMessage).sendBatch();
        })
        .matches(/^reset$/i, function (session) {
            session.endDialogWithResult({response: {reset: true}});
        });
}

function parseBoolean(input) {
    input = input.trim();
    const yesExp = /^(y|si|sí|yes|yep|sure|ok|true)/i;
    const noExp = /^(n|no|nope|not|false)/i;
    if (yesExp.test(input)) {
        return true;
    }
    else if (noExp.test(input)) {
        return false;
    }
    return undefined;
}