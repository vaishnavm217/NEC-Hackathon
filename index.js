'use strict';

const functions = require('firebase-functions');
const { WebhookClient } = require('dialogflow-fulfillment');
const { Card, Suggestion } = require('dialogflow-fulfillment');
const { BigQuery } = require('@google-cloud/bigquery');

const bigquery = new BigQuery();

process.env.DEBUG = 'dialogflow:debug';

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });
  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

  /**
   * Queries BigQuery and retrieves the results
   * @param {String} subject 
   * @param {Integer} classValue 
   * @param {String} chapterName 
   */
  async function notesQuery(subject, classValue, chapterName) {
    const query = 'SELECT Link FROM \`mercurial-bruin-254505.chatbot.notes\` WHERE Subject = "' + subject + '" and Chapter = "' + chapterName + '" and Class = ' + classValue;
    console.log("Query: ", query)
    const options = {
      query: query,
      location: 'US',
    };

    const [job] = await bigquery.createQueryJob(options);
    console.log(`Job ${job.id} started.`);
    const [rows] = await job.getQueryResults();
    console.log('Rows:');
    rows.forEach(row => console.log(row));
    return rows
  }

  /**
   * Intent handler for doubts raised by user
   * @param {dialogflow agent} agent 
   */
  function doubtSolver(agent) {
    const uuidv1 = require('uuid/v1')
    var subject = agent.parameters["subjects"];
    var classValue = agent.parameters["class"];
    var doubtValue = agent.parameters["doubtValue"];
    var text = 'Sure, your ticket number issued is ' + uuidv1() + '. Your doubt \' ' + doubtValue + '\' will be clarified. Solution will be sent in your registered mail id.'
    agent.add(text);
  }

  /**
   * Intent handler for notes required by user
   * @param {dialogflow agent} agent 
   */
  function noteRetriever(agent) {
    var subject = agent.parameters["subjects"];
    var classValue = agent.parameters["class"];
    var chapterName = agent.parameters["chapterName"];
    var rows = await notesQuery(subject, classValue, chapterName)
    console.log("rows: ", rows)
    console.log("link : ", rows.Link)
    var link = rows['Link']
    console.log("link 2 : ", link)
    var text = 'Sure, here is the link of notes in pdf version. '+link
  }

  /**
   * Intent handler for taking quiz by user
   * @param {dialogflow agent} agent 
   */
  function assesment(agent) {
    var subject = agent.parameters["subjects"];
    var classValue = agent.parameters["class"];
    var chapterName = agent.parameters["chapterName"];
  }

  /**
   * Intent handler for welcoming user
   * @param {dialogflow agent} agent 
   */
  function welcome(agent) {
    agent.add(`Welcome to my agent!`);
  }

  /**
   * Intent handler for fallbacks
   * @param {dialogflow agent} agent 
   */
  function fallback(agent) {
    agent.add(`I'm sorry, can you try again?`);
  }

  /**
   * Sets the respective intents to their function handlers
   */
  let intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);
  intentMap.set('Notes', noteRetriever);
  intentMap.set('Assessment', assesment);
  intentMap.set('doubtClarification', doubtSolver);
  intentMap.set('doubtClarificationText', doubtSolver);
  agent.handleRequest(intentMap);
});
