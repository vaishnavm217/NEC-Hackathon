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
   * Queries BigQuery and retrieves the result of notes
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
    console.log('Rows returned');
    rows.forEach(row => console.log(row));
    return rows
  }

  /**
   * Queries BigQuery and retrieves the result of questions
   * @param {String} subject 
   * @param {Integer} classValue 
   * @param {String} chapterName 
   */
  async function questionsQuery(subject, classValue, chapterName) {
    const query = 'SELECT questionNumber, question, option1, option2, option3, option4, answer FROM \`mercurial-bruin-254505.chatbot.questionBank\` WHERE Subject = "' + subject + '" and chapterName = "' + chapterName + '" and Class = ' + classValue + ' order by questionNumber';
    console.log("Query: ", query)
    const options = {
      query: query,
      location: 'US',
    };
    const [job] = await bigquery.createQueryJob(options);
    console.log(`Job ${job.id} started.`);
    const [rows] = await job.getQueryResults();
    console.log('Rows returned');
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
    var classValue = agent.parameters["hindiClass"];
    var doubtValue = agent.parameters["doubtValue"];
    console.log("entered doubt solver");
    if (agent.locale == 'en') {
      console.log("entered english");
      var text = 'Sure, your ticket number issued is ' + uuidv1() + '. Your doubt \' ' + doubtValue + '\' will be clarified. Solution will be sent in your registered mail id.'
      agent.add(text);
    }
    else if (agent.locale == 'hi') {
      console.log("entered hindi");
      var hindiText = 'धन्यवाद, आपका टिकट नंबर ' + uuidv1() + ' है! आपके डाउट का समाधान आपके दर्ज कराये मेल पे भेज दिया जायेगा।'
      agent.add(hindiText);
    }
  }

  /**
   * Intent handler for notes required by user
   * @param {dialogflow agent} agent 
   */
  async function noteRetriever(agent) {
    var subject = agent.parameters["subjects"];
    var classValue = agent.parameters["class"];
    var chapterName = agent.parameters["chapterName"];
    await notesQuery(subject, classValue, chapterName).then(output => {
      console.log("output of notes:", output)
      var link = output[0].Link
      var text = 'Sure, here is the link of notes in pdf version. ' + link
      console.log("text: ", text)
      agent.add(text)
    })
  }

  /**
   * Intent handler for taking quiz by user
   * @param {dialogflow agent} agent 
   */
  async function assesment(agent) {
    var text = 'Sure, There will be total 5 questions. Please type START when you are ready. '
    agent.add(text)
  }

  /**
 * Intent handler for taking quiz and printing first question
 * @param {dialogflow agent} agent 
 */
  async function assesmentFirstQuestion(agent) {
    var subject = agent.parameters["subjects"];
    var classValue = agent.parameters["class"];
    var chapterName = agent.parameters["chapterName"];
    await questionsQuery(subject, classValue, chapterName).then(output => {
      console.log("output of question bank:", output)
      agent.context.set({
        'name': 'questionsSet',
        'lifespan': 10,
        'parameters': { 'questionBank': output }
      });
      var text = 'question is: ' + output[0].question + '. option 1 is: ' + output[0].option1 + '. option 2 is: ' + output[0].option2 + '. option 3 is: ' + output[0].option3
      console.log("assesmentFirstQuestion text: ", text)
      agent.add(text)
    })
  }


  /**
 * Intent handler for taking quiz and printing first question
 * @param {dialogflow agent} agent 
 */
  async function assessmentSecondQuestion(agent) {
    var questionBank = agent.parameters["questionBank"];
    var optionNumber = agent.parameters["optionNumber"];
    var paramScore = agent.parameters["score"];
    var score = 0 + Number(paramScore)
    console.log('questionBank: ', questionBank)
    console.log('optionNumber: ', optionNumber)
    if (optionNumber ===  questionBank[0].answer){
      console.log("inside correct")
      score = score + 1
      var answerText = 'Congrats! answer is correct. ' 
      questionBank.shift()
      agent.context.set({
        'name': 'questionsSet',
        'lifespan': 10,
        'parameters': { 'questionBank': questionBank, 'score':score }
      });
      if (questionBank.length === 0){
        var text = answerText + " Your quiz ended. Total score is "+ score
        agent.add(text)
      }
      else{
        console.log("questionBank: ", questionBank)
        var text = answerText + 'Next question is: ' + questionBank[0].question + '. option 1 is: ' + questionBank[0].option1 + '. option 2 is: ' + questionBank[0].option2 + '. option 3 is: ' + questionBank[0].option3 + '. option 4 is: ' + questionBank[0].option4
        agent.add(text)
      }
    }
    else if (optionNumber !=  questionBank[0].answer){
      console.log("inside wrong")
      var answerText = 'Sorry, correct answer is option ' + questionBank[0].answer
      questionBank.shift()
      agent.context.set({
        'name': 'questionsSet',
        'lifespan': 10,
        'parameters': { 'questionBank': questionBank, 'score':score }
      });
      if (questionBank.length === 0){
        var text = answerText + " Your quiz ended. Total score is "+ score
        agent.add(text)
      }
      else{
        console.log("questionBank: ", questionBank)
        var text = answerText + 'Next question is: ' + questionBank[0].question + '. option 1 is: ' + questionBank[0].option1 + '. option 2 is: ' + questionBank[0].option2 + '. option 3 is: ' + questionBank[0].option3 + '. option 4 is: ' + questionBank[0].option4
        agent.add(text)
      }
    }
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
  intentMap.set('AssessmentFirstQuestion', assesmentFirstQuestion);
  intentMap.set('AssessmentSecondQuestion', assessmentSecondQuestion);
  intentMap.set('doubtClarification', doubtSolver);
  intentMap.set('doubtClarificationText', doubtSolver);
  agent.handleRequest(intentMap);
});
