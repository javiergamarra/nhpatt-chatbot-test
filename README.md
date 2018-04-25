# Environment

* [Luis.ai](http://luis.ai) trained with the intents and entities for the demo
* Azure function (Function App)
* Azure chatbot (Functions Bot)
* [Github repository](https://github.com/nhpatt/nhpatt-chatbot-test1)
* BotFramework.app, node... if you want to test it locally (recommended if you want to change the code)

* Environment variables needed (remote and locally):

    * LuisAPIKey
    * LuisAppId
    * LuisAPIHostName (like westus.api.cognitive.microsoft.com)
    * BING_MAP
    * URL (server url like http://liferay-gs.liferay.org.es/)
    * LIFERAY_PASSWORD (admin password)
    * LIFERAY_USER (admin user)
    * USER_PASSWORD (default user password)
    
# How to set it up

1. Register into luis.ai, think in the intents you want to support (like *seguros* or *parte*), create them and 
enter at least 5 sentences related to each intent.

Test them in the right tab and train it. After training publish it to the staging and production slot.
 
You have to copy three values to set them in your azure bot, the luis key (publish tab under resources and keys), the luis url (the endpoint until /luis/) and the luis app id (settings tab, application id).
 
2. Create an azure bot in [microsoft azure](https://portal.azure.com/), a *functions bot* (default values are Ok). 
The Bot template should be nodejs (doesn't matter the type). We don't need application insights.

After setting it up, enter the newly created resource and under the build option, select *configure continuous deployment*
and point to your repository, cloned from [here](https://github.com/nhpatt/nhpatt-chatbot-test1)

After that, configure the channels you need. You can test your bot with the test window. If you want to integrate telegram you'll need to create a bot.

3. Configure your code

In index.js change your messages to localize them or code to change the flow.


//TODO migrate to WeDeploy