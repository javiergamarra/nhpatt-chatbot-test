'use strict';

const builder = require('botbuilder');
const botbuilder_azure = require('botbuilder-azure');
const rp = require('request-promise');
const Promise = require('bluebird');
const locationDialog = require('botbuilder-location');
require('request-to-curl');

const locale = 'es_ES';
const localhost = process.env.NODE_ENV === 'localhost';
const USERNAME = process.env.LIFERAY_USER;
const PASSWORD = process.env.LIFERAY_PASSWORD;
const host = (localhost ? 'http://localhost:8080' : process.env.URL) + '/api/jsonws/';

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
        setTimeout(() => builder.Prompts.number(session, 'I would not like them to make me scrap! 😯 ' +
            'Can you help me with a good assessment? ' +
            'From 1 to 5, 1 being very little satisfied 😞 and 5 sooo satisfied 😊'), 3000);
    },
    (session, results, next) => {
        session.userData.valoration = results.response;
        let review = results.response < 3 ? '😞' : '😊';
        session.send(review + ' Thank you very much!');
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

        tryToLogin(session);

        session.send(
            [
                'Welcome to Liferay Mutual! How can I help you?',
                'Hello! How can I help you?',
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
                builder.Prompts.text(session, 'Hello, what is your name?');
            }
        },
        (session) => {

            tryToLogin(session);

            if (!session.conversationData.name) {
                session.conversationData.name = session.message.text;
            }
            session.send([
                'Nice to meet you %s, can I help you? 😊',
                'Hello %s, welcome to Liferay Mutual. How can I help you? 😊'
            ], session.conversationData.name);

            session.send('Today, I can tell you what insurance you can hire or give a part');

        }])
    .matches('Help', (session) => {
        session.send('You have asked for help... \'%s\'.', session.message.text);
    })
    .matches('Issue', [
        (session, results, next) => {

            if (results.entities && results.entities.length) {
                session.send('Ok, I understand, a part about %s', results.entities[0].entity);
                next();
            } else {
                builder.Prompts.text(session, 'Can you tell me about what kind of insurance do you want to register a part?');
            }
        },
        (session) => {
            builder.Prompts.confirm(session, 'Have you had a traffic accident?');
        },
        (session, results) => {


            session.send('Ok, do not worry about anything, in a couple of minutes we wil have finished. 😉');
            session.send('We are going to ask you a series of questions to help you better');

            session.userData.type = results.response;

            post(session, 'ddm.ddmstructure/get-structure', {'structureId': 157436})
                .then(response => {
                    const message = JSON.parse(response);
                    return JSON.parse(message.definition);
                })
                .then(function (result) {
                    let random = '' + Math.random();
                    let numberOfFields = result.fields.length;

                    session.userData.form = {};

                    let dialogs = result.fields.map(field =>
                        (session, results, next) => createAndProcessFields(session, results, next, numberOfFields, field)
                    );

                    bot.dialog(random, dialogs);

                    session.beginDialog(random);
                })
                .catch(err => console.log(err))
        },
        (session, results, next) => {

            processResults(session, results)
                .then(() => {
                        console.log(JSON.stringify(session.userData.form));
                        return post(session, 'ddl.ddlrecord/add-record',
                            {
                                groupId: 20152,
                                recordSetId: 157439,
                                // recordSetId: 271054,
                                displayIndex: 0,
                                fieldsMap: JSON.stringify(session.userData.form)
                            }
                        )
                    }
                )
                .then(() => {
                    session.send('We have finished %s, I hope it was fast.', session.conversationData.name);

                    timeout(session,                
                        'Thank you for the pacience! Shortly you will receive an email with the acknowledgment of ' +
                        'receipt of the party. You can also check your status from the website or from the app, ' +
                        'in the "Issues" section.', 2000);

                    timeout(session, [
                        'Remember that for any questions we are available at 666999999.',
                        'If you need to communicate with us during the spara we are available at 666999999 for any consultation you require.',
                        'Remember to install our app!'
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

            timeout(session, 'Thank you for the pacience!', 2000);
            setTimeout(() => session.send('See you soon! 😊'), 4000);

            next();
        }
    ])
    .matches('Seguros', [
        (session) => {

            timeout(session, 'I am glad you ask me that question, we have the best car insurance in the market.', 2000);
            timeout(session, 'We have four types of car insurance: All risk, third parties, franchise and classic cars.', 3000);
            timeout(session, 'This is the page where you can find all the information: http://liferay-gs.liferay.org.es/web/liferay-mutual/car-insurance/third-party-insurance', 5000);

            setTimeout(() => builder.Prompts.choice(session, 'Have you found something that matches what you are looking for?', ['Yes', 'No']), 7000);
        },
        (session) => {

            session.sendTyping();
            setTimeout(() => {
                session.send('Pleased to have helped you, %s! :-D', session.conversationData.name || '');
                session.sendTyping();
            }, 1000);

            setTimeout(() => session.beginDialog('survey'), 2000);
        },
    ])
    .matches('Cancel', (session) => {
        session.send('You reached Cancel intent, you said \'%s\'.', session.message.text);
        session.conversationData = {};
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

function createAndProcessFields(session, results, next, numberOfFields, field) {

    processResults(session, results)
        .then(() => {
            const userData = session.userData;

            const dialogDatum = session.dialogData['BotBuilder.Data.WaterfallStep'] + 1;

            const label = dialogDatum + '/' + numberOfFields + ' - ' + field.label[locale];
            writeEncouragingMessages(dialogDatum, session);

            userData.lastField = field;

            createPrompts(session, label, field);
        })
        .catch(err => console.log(err))
}

function processResults(session, results) {

    const userData = session.userData;
    if (!results || !results.response || !userData.lastField) {
        return Promise.resolve();
    }

    const lastField = userData.lastField.name;

    const response = results.response;

    if (response.geo) {
        userData.form[lastField] = '{\"latitude\":' + response.geo.latitude + ', \"longitude\":' + response.geo.longitude + '}';
    } else if (response.resolution) {
        const d = response.resolution.start;
        userData.form[lastField] = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    } else if (response.entity) {
        userData.form[lastField] = '[\"' + userData.lastField.options.filter(x => x.label[locale] === response.entity)[0].value + '\"]';
    } else if (Array.isArray(response)) {

        const file = response[0];

        return rp({encoding: null, uri: file.contentUrl})
            .then(function (response) {
                // session.send(JSON.stringify(file));
                const randomNumber = ('' + Math.random()).substr(2);

                let extension = file.contentType === 'image/png' ? '.png' :
                    file.contentType === 'image/jpg' ? 'jpg' : 'application/octet-stream';

                let fileName = file.name || (randomNumber + extension);

                return post(session, 'dlapp/add-file-entry', {
                    'repositoryId': 20152,
                    'folderId': 184570,
                    'sourceFileName': fileName,
                    'mimeType': file.contentType,
                    'title': fileName,
                    'description': '-',
                    'changeLog': '-',
                    'bytes': '[' + [...response].toString() + ']',
                })
            })
            .then(function (response) {
                const obj = JSON.parse(response);
                userData.form[userData.lastField.name] = '{' +
                    '"groupId":20152,' +
                    '"uuid":"' + obj.uuid + '",' +
                    '"version":1.0,' +
                    '"folderId":184570,' +
                    '"title":"' + obj.fileName + '"}';
            });
    } else {
        userData.form[lastField] = response;
    }
    return Promise.resolve();
}

function writeEncouragingMessages(dialogDatum, session) {
    if (dialogDatum === 2) {
        session.send('Perfect! Without that I would not have been able to register the part 😊');
    } else if (dialogDatum === 7) {
        session.send('Thanks, we are about to finish.');
    } else if (session.userData.lastField && session.userData.lastField.dataType === 'date' && session.message.text) {
        if (session.message.text.toLowerCase() === 'hoy') {
            session.send('Shortly, technical assistance will come to help you. ' +
                'You will receive a notification to the mobile phone where you can see the path that the crane follows until it is with you.');
        } else {
            session.send('Shortly you will receive an email with the acknowledgment of receipt of the party. ' +
                'You can also check your status from the website or from the app, in the "Issues" section.');
        }
    }
}

function createPrompts(session, label, field) {
    if ('select' === (field.type)) {
        let choices = field.options.map(x => x.label[locale]);
        const choiceSynonyms = [
            {value: 'Sí', synonyms: ['Si', 'Sí', 'Yes']},
            {value: 'No', synonyms: ['No', 'Nop']}
        ];
        builder.Prompts.choice(session, label, choices.indexOf('Yes') !== -1 ? choiceSynonyms : choices);
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

    let post1 = rp.post(host + url, {form});

    // session.send(JSON.stringify(session.userData));

    if (session.userData && session.userData.username) {
        return post1.auth(session.userData.username, session.userData.password, true);
    } else {
        return post1.auth(USERNAME, PASSWORD, true);
    }
}

function tryToLogin(session) {
    let message = session.message;

    // session.send('Intentando loguear...');
    // session.send(session.message);

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
