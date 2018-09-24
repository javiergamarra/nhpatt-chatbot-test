'use strict';

const winston = require('winston');

const logging = winston.createLogger({
    level: 'debug',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({filename: 'D:/home/site/wwwroot/messages/error.log', level: 'debug'}),
    ]
});

logging.log({level: 'debug', message: 'Starting log...'});

const builder = require('botbuilder');
const botBuilderAzure = require('botbuilder-azure');
const requestPromise = require('request-promise');
const promise = require('bluebird');
const locationDialog = require('botbuilder-location');

const LOCALE = 'es_ES';
const USERNAME = process.env.LIFERAY_USER;
const PASSWORD = process.env.LIFERAY_PASSWORD;
const USE_EMULATOR = process.env.NODE_ENV === 'localhost';
const SERVER_URL = (USE_EMULATOR ? 'http://localhost:8080/' : process.env.URL) + 'api/jsonws/';

try {

    logging.log({
        level: 'debug',
        message: `Dependencies ready with host ${SERVER_URL} and using emulator ${USE_EMULATOR}`
    });

    const connector = USE_EMULATOR ? new builder.ChatConnector() : new botBuilderAzure.BotServiceConnector({
        appId: process.env['MicrosoftAppId'],
        appPassword: process.env['MicrosoftAppPassword'],
        openIdMetadata: process.env['BotOpenIdMetadata']
    });

    logging.log({level: 'debug', message: `Connector initialized...`});

    const bot = new builder.UniversalBot(connector,
        {
            localizerSettings: {
                defaultLocale: 'es',
                botLocalePath: './locale'
            }
        }
    );

    logging.log({level: 'debug', message: `Bot initialized...`});

    /*
        const tableName = 'botdata';
        const azureTableClient = new botBuilderAzure.AzureTableClient(tableName, process.env['AzureWebJobsStorage']);
        const tableStorage = new botBuilderAzure.AzureBotStorage({gzipData: false}, azureTableClient);
        bot.set('storage', tableStorage);
    */

    const mapLibrary = locationDialog.createLibrary(process.env.BING_MAP || '');
    bot.library(mapLibrary);

    bot.dialog('survey', [
        session => {
            setTimeout(() => builder.Prompts.number(session, 'No me gustaría que me hiciesen chatarra! 😯 ' +
                '¿me ayudas con una buena valoración? ' +
                'Del 1 al 5, siendo 1 muy poco satisfecho 😞 y 5 muuuuy satisfecho 😊'), 3000);
        },
        (session, results, next) => {
            session.userData.valoration = results.response;
            let review = results.response < 3 ? '😞' : '😊';
            session.send(review + ' Muchas gracias!');
            next();
        }
    ]);

    logging.log({level: 'debug', message: `First dialog...`});

    const LUIS_APP_ID = process.env.LuisAppId;
    const LUIS_API_KEY = process.env.LuisAPIKey;
    const LUIS_API_HOSTNAME = process.env.LuisAPIHostName || 'westus.api.cognitive.microsoft.com';
    const LUIS_API_URL = 'https://' + LUIS_API_HOSTNAME + '/luis/v2.0/apps/' + LUIS_APP_ID + '&subscription-key=' + LUIS_API_KEY;

    logging.log({level: 'debug', message: `LUIS settings...`});

    const recognizer = new builder.LuisRecognizer(LUIS_API_URL);

    const intents = new builder.IntentDialog({recognizers: [recognizer]}).onBegin(session => {

        session.conversationData.name = '';

        tryToLogin(session);

        logging.log({level: 'debug', message: 'Hi!...'});

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
    }).matches('Greeting', [
        (session, results, next) => {

            if (session.conversationData.name) {
                next();
            } else {
                builder.Prompts.text(session, 'Hola, te puedo preguntar cómo te llamas?');
            }
        },
        (session) => {

            tryToLogin(session);

            if (!session.conversationData.name) {
                session.conversationData.name = session.message.text;
            }
            session.send([
                'Encantado de conocerte %s, ¿en qué puedo ayudarte? 😊',
                'Hola %s, bienvenido a Liferay Mutual. ¿En qué puedo ayudarte? 😊'
            ], session.conversationData.name);

            session.send('A día de hoy, te puedo decir que seguros puedes contratar o dar un parte');

        }]
    ).matches('Help', session => session.send('Has pedido ayuda... \'%s\'.', session.message.text)
    ).matches('Parte', [
        (session, results, next) => {

            if (results.entities && results.entities.length) {
                session.send('Ok, entendido, un parte de %s', results.entities[0].entity);
                next();
            } else {
                builder.Prompts.text(session, '¿Me puedes decir sobre qué tipo de seguro quieres dar de alta un parte?');
            }
        },
        session => {
            builder.Prompts.confirm(session, '¿Has tenido un accidente de tráfico?');
        },
        (session, results) => {


            session.send('Ok, no te preocupes de nada, en un par de minutos habremos acabado. 😉');
            session.send('Vamos a hacerte una serie de preguntas para poder ayudarte mejor');

            session.userData.type = results.response;

            post(session, 'ddm.ddmstructure/get-structure', {'structureId': 271050}).then(response => {
                const message = JSON.parse(response);
                return JSON.parse(message.definition);
            }).then(function (result) {

                // session.send(JSON.stringify(result));

                let random = '' + Math.random();
                let numberOfFields = result.fields.length;

                session.userData.form = {};

                let dialogs = result.fields.map(field =>
                    (session, results, next) => createAndProcessFields(session, results, next, numberOfFields, field)
                );

                bot.dialog(random, dialogs);

                session.beginDialog(random);
            }).catch(err =>
                logging.log({level: 'debug', message: JSON.stringify(err)})
            )
        },
        (session, results, next) => {

            processResults(session, results).then(() => {
                logging.log({level: 'debug', message: JSON.stringify(session.userData.form)});
                return post(session, 'ddl.ddlrecord/add-record',
                    {
                        groupId: 20152,
                        recordSetId: 271054,
                        displayIndex: 0,
                        fieldsMap: JSON.stringify(session.userData.form)
                    }
                )
            }).then(() => {
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
                    setTimeout(() => session.beginDialog('survey'), 5000);
                } else {
                    next();
                }
            });
        },
        (session, results, next) => {

            timeout(session, 'Muchas gracias por la paciencia!', 2000);
            setTimeout(() => session.send('Nos vemos pronto! 😊'), 4000);

            next();
        }
    ]).matches('Seguros', [
        (session) => {

            timeout(session, 'Me alegra que me hagas esa pregunta, tenemos los mejores seguros de coches del mercado.', 1000);
            timeout(session, 'Disponemos de cuatro tipos de seguro de coche: Todo riesgo, a terceros, con franquicia y para coches clásicos.', 3000);
            timeout(session, 'Esta es la página donde podrás encontrar toda la información: https://liferay-insurances-demo.liferay.org.es/web/liferay-mutual/car-insurance/third-party-insurance', 5000);

            setTimeout(() => builder.Prompts.choice(session, 'Has encontrado algo que cuadre con lo que buscas?', ['Si', 'No']), 7000);
        },
        (session) => {

            session.sendTyping();
            setTimeout(() => {
                session.send('Encantado de haberte ayudado %s! :-D', session.conversationData.name || '');
                session.sendTyping();
            }, 1000);

            setTimeout(() => session.beginDialog('survey'), 2000);
        },
    ]).matches('Cancel', (session) => {
        session.send('You reached Cancel intent, you said \'%s\'.', session.message.text);
        session.conversationData = {};
    }).onDefault((session) => {
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

    if (USE_EMULATOR) {
        const restify = require('restify');
        const server = restify.createServer();
        server.listen(3978, function () {
            console.log('test bot endpoint at http://localhost:3978/api/messages');
        });
        server.post('/api/messages', connector.listen());
    } else {
        module.exports = connector.listen();
    }

} catch (e) {
    logging.log({level: 'debug', message: 'Error :(' + JSON.stringify(e)});
}

function createAndProcessFields(session, results, next, numberOfFields, field) {

    processResults(session, results).then(() => {

        const userData = session.userData;

        const dialogDatum = session.dialogData['BotBuilder.Data.WaterfallStep'] + 1;

        const label = dialogDatum + '/' + numberOfFields + ' - ' + field.label[LOCALE];
        writeEncouragingMessages(dialogDatum, session);

        userData.lastField = field;

        createPrompts(session, label, field);

    }).catch(err => logging.log({level: 'debug', message: JSON.stringify(err)}))
}

function processResults(session, results) {

    const userData = session.userData;
    if (!results || !results.response || !userData.lastField) {
        return promise.resolve();
    }

    const lastField = userData.lastField.name;

    const response = results.response;

    if (response.geo) {
        userData.form[lastField] = '{\"latitude\":' + response.geo.latitude + ', \"longitude\":' + response.geo.longitude + '}';
    } else if (response.resolution) {
        const d = response.resolution.start;
        userData.form[lastField] = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    } else if (response.entity) {
        userData.form[lastField] = '[\"' + userData.lastField.options.filter(x => x.label[LOCALE] === response.entity)[0].value + '\"]';
    } else if (Array.isArray(response)) {

        const file = response[0];

        return requestPromise({encoding: null, uri: file.contentUrl}).then(function (response) {
            // session.send(JSON.stringify(file));
            const randomNumber = ('' + Math.random()).substr(2);

            let extension = file.contentType === 'image/png' ? '.png' :
                file.contentType === 'image/jpg' ? 'jpg' : 'application/octet-stream';

            let fileName = file.name || (randomNumber + extension);

            return post(session, 'dlapp/add-file-entry', {
                'repositoryId': 20152,
                'folderId': 184528,
                'sourceFileName': fileName,
                'mimeType': file.contentType,
                'title': fileName,
                'description': '-',
                'changeLog': '-',
                'bytes': '[' + [...response].toString() + ']',
            })
        }).then(function (response) {
            const obj = JSON.parse(response);
            userData.form[userData.lastField.name] = '{' +
                '"groupId":20152,' +
                '"uuid":"' + obj.uuid + '",' +
                '"version":1.0,' +
                '"folderId":184528,' +
                '"title":"' + obj.fileName + '"}';
        });
    } else {
        userData.form[lastField] = response;
    }
    return promise.resolve();
}

function writeEncouragingMessages(dialogDatum, session) {
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
}

function createPrompts(session, label, field) {
    if ('select' === (field.type)) {
        let choices = field.options.map(x => x.label[LOCALE]);
        const choiceSynonyms = [
            {value: 'Sí', synonyms: ['Si', 'Sí', 'Yes']},
            {value: 'No', synonyms: ['No', 'Nop']}
        ];
        builder.Prompts.choice(session, label, choices.indexOf('Sí') !== -1 ? choiceSynonyms : choices);
    } else if ('date' === (field.dataType)) {
        builder.Prompts.time(session, label);
    } else if ('document-library' === (field.dataType)) {
        builder.Prompts.attachment(session, label, {maxRetries: 0})
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

function post(session, url, form) {

    let post1 = requestPromise.post(SERVER_URL + url, {form});

    if (session.userData && session.userData.username) {
        return post1.auth(session.userData.username, session.userData.password, true);
    } else {
        return post1.auth(USERNAME, PASSWORD, true);
    }
}

function tryToLogin(session) {
    const message = session.message;

    logging.log({level: 'debug', message: JSON.stringify(message)});

    if (message && message.text && message.text.indexOf('start') !== -1) {
        session.userData.username = message.text.replace('/start ', '');
        session.userData.password = process.env.USER_PASSWORD;
        session.sendTyping();
    }
}

function timeout(session, message, delay) {
    session.sendTyping();
    setTimeout(() => {
        session.send(message);
        session.sendTyping();
    }, delay);
}

lib.dialog('confirm-dialog', createDialog(), true);

function createDialog() {
    return createBaseDialog().onBegin(function (session, args) {
        const confirmationPrompt = args.confirmationPrompt;
        session.send(confirmationPrompt).sendBatch();
    }).onDefault(function (session) {
        const message = parseBoolean(session.message.text);
        if (typeof message === 'boolean') {
            session.endDialogWithResult({response: {confirmed: message}});
            return;
        }
        session.send('InvalidYesNo').sendBatch();
    });
}

function createBaseDialog(options) {
    return new builder.IntentDialog(options).matches(/^cancel$/i, function (session) {
        session.send(consts_1.Strings.CancelPrompt);
        session.endDialogWithResult({response: {cancel: true}});
    }).matches(/^help$/i, function (session) {
        session.send(consts_1.Strings.HelpMessage).sendBatch();
    }).matches(/^reset$/i, function (session) {
        session.endDialogWithResult({response: {reset: true}});
    });
}

function parseBoolean(input) {
    input = input.trim();
    const yesExp = /^(y|si|sí|yes|yep|sure|ok|true)/i;
    const noExp = /^(n|no|nope|not|false)/i;
    if (yesExp.test(input)) {
        return true;
    } else if (noExp.test(input)) {
        return false;
    }
    return undefined;
}
