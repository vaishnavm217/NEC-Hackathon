'use strict';

const functions = require('firebase-functions');
const { WebhookClient } = require('dialogflow-fulfillment');
const { Card, Suggestion } = require('dialogflow-fulfillment');
const { BigQuery } = require('@google-cloud/bigquery');
var nodemailer = require('nodemailer');
var transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'dikhshabot@gmail.com',
        pass: 'qwerty@123'
    }
});


const {
    dialogflow,
    BasicCard,
    Permission,
    BrowseCarousel,
    BrowseCarouselItem,
    Button,
    Carousel,
    LinkOutSuggestion,
    List,
    Image,
    MediaObject,
    Suggestions,
    NewSurface,
    SimpleResponse,
} = require('actions-on-google');
const bigquery = new BigQuery();
const app = dialogflow({ debug: true });
process.env.DEBUG = 'dialogflow:debug';

// exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
exports.dialogflowFirebaseFulfillment = functions.https.onRequest(app);
// const agent = new WebhookClient({ request, response });
// console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
// console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

/**
 * To append the test result to bigquery
 * @param {String} emailid 
 * @param {Integer} score 
 * @param {String} subject 
 * @param {Integer} classValue 
 * @param {String} chapterName 
 */
async function insertRowsAsStream(emailid, score, subject, classValue, chapterName) {
    console.log('emailid: ', emailid, 'score: ', score, 'subject: ', subject, 'classValue: ', classValue, 'chapterName: ', chapterName)
    const datasetId = 'chatbot';
    const tableId = 'testResult';
    const rows = [{ 'emailid': emailid, 'score': score, 'subject': subject, 'classValue': classValue, 'chapterName': chapterName }];

    const bigqueryClient = new BigQuery();

    await bigqueryClient
        .dataset(datasetId)
        .table(tableId)
        .insert(rows);
    console.log(`Inserted ${rows.length} rows`);
}


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
 * @param {dialogflow conv} conv 
 */
async function doubtSolver(conv) {
    const uuidv1 = require('uuid/v1')
    var subject = conv.parameters["subjects"];
    var classValue = conv.parameters["hindiClass"];
    var doubtValue = conv.parameters["doubtValue"];
    console.log("entered doubt solver");
    console.log('user locale', conv.user.locale)
    if (conv.user.locale == 'en-IN') {
        console.log("entered english");
        var text = 'Alright. Your ticket is issued and the ticket number is DG-' + Math.floor(Math.random() * (999 - 100 + 1) + 100) + '.'
        var doubtText = 'Your doubt \' ' + doubtValue + '\' will be clarified soon. Solution will be sent to your registered email id.'
        var emailContext = conv.contexts.get('verify_email_contexts')
        console.log('email context', emailContext);
        var email = emailContext.parameters['verified_email']
        await emailCustomer(email, text)
        conv.contexts.delete('doubtClarification-followup')
        conv.add(text);
        conv.add(doubtText)
    }
    else if (conv.user.locale == 'hi-IN') {
        console.log("entered hindi");
        var hindiText = 'धन्यवाद, आपका टिकट नंबर ' + Math.floor(Math.random() * (999 - 100 + 1) + 100) + '.'
        var doubtText = ' है! आपके डाउट का समाधान आपके दर्ज कराये मेल पे भेज दिया जायेगा।'
        conv.contexts.delete('doubtClarification-followup')
        conv.add(hindiText);
        conv.add(doubtText);
    }
}

/**
 * Intent handler for notes required by user
 * @param {dialogflow conv} conv 
 */
async function noteRetriever(conv) {
    var subject = conv.parameters["subjects"];
    var classValue = conv.parameters["class"];
    var chapterName = conv.parameters["chapterName"];
    await notesQuery(subject, classValue, chapterName).then(output => {
        console.log("output of notes:", output)
        if (output.length === 0) {
            conv.add('Sorry, right now the required material is not available. We will update our dataset soon.')
        }
        else {
            var link = output[0].Link
            var text = 'Sure. Here is the pdf version of the notes: ' + chapterName + ' that you requested.'
            var clickText = 'Please click on the link below to download it. ' + link
            console.log("text: ", text)
            conv.add(text)
            conv.add(clickText)
            // conv.add(link)
        }
    })
}

/**
 * Intent handler for taking quiz by user
 * @param {dialogflow conv} conv 
 */
async function assesment(conv) {
    var text = 'Sure, There will be total 2 questions. Please type START when you are ready. '
    conv.add(text)
}

/**
* Intent handler for taking quiz and printing first question
* @param {dialogflow conv} conv 
*/
async function assesmentFirstQuestion(conv) {
    var subject = conv.parameters["subjects"];
    var classValue = conv.parameters["class"];
    var chapterName = conv.parameters["chapterName"];
    await questionsQuery(subject, classValue, chapterName).then(output => {
        console.log("output of question bank:", output)
        if (output.length === 0) {
            conv.add('Sorry, right now the required material is not available. We will update our dataset soon.')
        }
        else {
            conv.contexts.set('questionsset', 10, { 'questionBank': output, 'subject': subject, 'classValue': classValue, 'chapterName': chapterName });
            // conv.contexts.set("verify_email_context", 100, { verified_email: email });
            // var text = 'question is: ' + output[0].question + '. option 1 is: ' + output[0].option1 + '. option 2 is: ' + output[0].option2 + '. option 3 is: ' + output[0].option3
            var text = 'Question is: ' + output[0].question + '?'
            var choiceText = 'Please choose from the options below.'
            console.log("assesmentFirstQuestion text: ", text)
            conv.add(text)
            conv.add(choiceText)
            // conv.ask(`Here's an example of a basic card.`);
            // conv.ask(new BasicCard({
            //     text: `This is a basic card. Breaks`, // Note the two spaces before '\n' required for
            //     // a line break to be rendered in the card.
            //     subtitle: 'This is a subtitle',
            //     title: 'Title: this is a title',
            //     buttons: new Button({
            //         title: 'This is a button',
            //         url: 'https://assistant.google.com/',
            //     }),
            //     image: new Image({
            //         url: 'https://storage.googleapis.com/actionsresources/logo_assistant_2x_64dp.png',
            //         alt: 'Image alternate text',
            //     }),
            //     display: 'CROPPED',
            // }));

            // conv.ask('Which response would you like to see next?');
            conv.ask(new Suggestions([output[0].option1]));
            conv.ask(new Suggestions([output[0].option2]));
            conv.ask(new Suggestions([output[0].option3]));
            conv.ask(new Suggestions([output[0].option4]));
        }
    })
}


/**
* Intent handler for taking quiz and printing first question
* @param {dialogflow conv} conv 
*/
async function assessmentSecondQuestion(conv) {
    var questionBank = conv.parameters["questionBank"];
    var optionNumber = conv.parameters["optionNumber"];
    var paramScore = conv.parameters["score"];
    var subject = conv.parameters["subject"];
    var classValue = conv.parameters["classValue"];
    var chapterName = conv.parameters["chapterName"];
    var score = 0 + Number(paramScore)
    console.log('questionBank: ', questionBank)
    console.log('optionNumber: ', optionNumber)
    console.log('questionBank[0].answer', questionBank[0].answer)
    if (optionNumber === questionBank[0].answer) {
        console.log("inside correct")
        score = score + 1
        var answerText = 'Congrats! Your Answer is Correct. '
        questionBank.shift()
        conv.contexts.set('questionsset', 10, { 'questionBank': questionBank, 'score': score, 'subject': subject, 'classValue': classValue, 'chapterName': chapterName });

        // conv.contexts.set({
        //     'name': 'questionsset',
        //     'lifespan': 10,
        //     'parameters': { 'questionBank': questionBank, 'score': score }
        // });
        if (questionBank.length === 0) {
            var text = answerText
            var quizEndText = " Quiz has ended. Your Total score is " + score + '.'
            var emailContext = conv.contexts.get('verify_email_contexts')
            console.log('email context', emailContext);
            var emailid = emailContext.parameters['verified_email']
            insertRowsAsStream(emailid, Number(score), subject, Number(classValue), chapterName);
            conv.contexts.delete('questionsset')
            console.log('All contexts', conv.contexts);
            conv.add(text)
            conv.add(quizEndText)
        }
        else {
            console.log("questionBank: ", questionBank)
            // var text = answerText + 'Next question is: ' + questionBank[0].question + '. option 1 is: ' + questionBank[0].option1 + '. option 2 is: ' + questionBank[0].option2 + '. option 3 is: ' + questionBank[0].option3 + '. option 4 is: ' + questionBank[0].option4
            var text = answerText;
            var nextQueText = 'Next Question : ' + questionBank[0].question + '?'
            var optionText = 'Please choose from the options below. '
            conv.add(text)
            // conv.add(nextQueText)
            conv.add(nextQueText + ' ' + optionText)
            conv.ask(new Suggestions([questionBank[0].option1]));
            conv.ask(new Suggestions([questionBank[0].option2]));
            conv.ask(new Suggestions([questionBank[0].option3]));
            conv.ask(new Suggestions([questionBank[0].option4]));

        }
    }
    else if (optionNumber != questionBank[0].answer) {
        console.log("inside wrong")
        var answerText = 'Sorry, Correct answer is option: ' + questionBank[0].answer + '.'
        questionBank.shift()
        conv.contexts.set('questionsset', 10, { 'questionBank': questionBank, 'score': score, 'subject': subject, 'classValue': classValue, 'chapterName': chapterName });

        // conv.contexts.set({
        //     'name': 'questionsset',
        //     'lifespan': 10,
        //     'parameters': { 'questionBank': questionBank, 'score': score }
        // });
        if (questionBank.length === 0) {
            var text = answerText
            var quizEndText = " Quiz has ended. Your Total score is " + score + '.'
            var emailContext = conv.contexts.get('verify_email_contexts')
            console.log('email context', emailContext);
            var emailid = emailContext.parameters['verified_email']
            insertRowsAsStream(emailid, Number(score), subject, Number(classValue), chapterName);
            conv.contexts.delete('questionsset')
            console.log('All contexts', conv.contexts);
            conv.add(text)
            conv.add(quizEndText)
        }
        else {
            console.log("questionBank: ", questionBank)
            // var text = answerText + 'Next question is: ' + questionBank[0].question + '. option 1 is: ' + questionBank[0].option1 + '. option 2 is: ' + questionBank[0].option2 + '. option 3 is: ' + questionBank[0].option3 + '. option 4 is: ' + questionBank[0].option4
            var text = answerText + 'Next question : ' + questionBank[0].question + '?'
            var choiceText = 'Please choose from the options below.'
            conv.add(text)
            conv.add(choiceText)
            conv.ask(new Suggestions([questionBank[0].option1]));
            conv.ask(new Suggestions([questionBank[0].option2]));
            conv.ask(new Suggestions([questionBank[0].option3]));
            conv.ask(new Suggestions([questionBank[0].option4]));
        }
    }
}

const EMAIL_CONTEXT = ['Welcome to the Dikhsha! To Proceed further, ', 'This is the Dikhsha! Welcome! To Proceed any further, ', 'Greetings, This is Dikhsha! To proceed any further, ']
const EMAIL_PERMISSION = 'EMAIL';
const EMAIL_CONTEXT_HIN = ['में दीक्षा आपका स्वागत करती हु'];
/**
 * Intent handler for welcoming user
 * @param {dialogflow conv} conv 
 */
function welcome(conv) {
    // conv.add(`Welcome to my conv!`);
    // let number = 1
    console.log("Entered the permission intent")
    // conv.contexts.set("testcontext", 0);
    // conv.contexts.set("nomatch", 0);
    // conv.add(responses[number]);
    // conv.ask(new Suggestions(['Play A lasting impression', 'Biography books', 'Books by Winterbotham']));
    // log("In request permission");
    if (conv.user.locale == 'en-IN') {
        conv.ask(new Permission({
            context: EMAIL_CONTEXT[0],
            permissions: EMAIL_PERMISSION,
        }));
    }
    else if (conv.user.locale == 'hi-IN') {
        conv.ask(new Permission({
            context: EMAIL_CONTEXT_HIN[0],
            permissions: EMAIL_PERMISSION,
        }));
    }
    else {
        conv.ask(new Permission({
            context: EMAIL_CONTEXT[0],
            permissions: EMAIL_PERMISSION,
        }));
    }

}



function emailVerified(conv) {

    console.log("In user info");
    //const explicit = conv.arguments.get(conv); // also retrievable with explicit arguments.get
    let responses = ["Hello! I am Dikhsha, your virtual assistant. I can assist you with revision notes, doubt clarification and assessment via quizzes. How can I help you?"];
    let responseHin = ['नमस्कार! में दीक्षा आपकी आभासी सहायक हूँ । आपकी नोट्स प्राप्ति, डॉब्टस समाधान और परीक्षा देना में सहयता कर सकती हूँ।']
    // let number = randomIntInc(0, (responses.length - 1));
    let ga_response;
    console.log("Conv user profile", conv.user.raw.profile);
    console.log("Conv user ", conv.user);
    console.log("Conv raw ", conv.user.raw);
    if (!conv.user.raw.profile) {
        console.log('++++++++++++++++++++++');
        ga_response = "No, you cannot be proceeded further.";
    }
    else {
        console.log('----------------------');
        const email = conv.user.raw.profile.email;
        conv.contexts.set("verify_email_contexts", 100, { verified_email: email });
        if (conv.user.locale == 'hi-IN') {
            ga_response = responseHin[0]
        }
        else if (conv.user.locale == 'en-IN') {
            ga_response = responses[0]
        }
        else {
            ga_response = responses[0]
        }
        //ga_response = "Email " + email + '. ' + ga_response;
    }

    conv.add(ga_response);
    // new_Suggestions(conv);
}

/**
 * Intent handler for fallbacks
 * @param {dialogflow conv} conv 
 */
function fallback(conv) {
    conv.add(`I'm sorry, can you try again? I can assist you with revision notes, doubt clarification and assessment via quizzes. How can I help you`);
}

async function emailCustomer(email, text) {
    transporter.sendMail({
        from: 'dikhshabot@gmail.com',
        to: email,
        subject: 'Diksha Ticket Details',
        text: text,
        attachments: [], function(err, info) {
            if (err) {
                console.error(err);
            }
            else {
                console.log(info);
            }
        }
    });
}

/**
 * Sets the respective intents to their function handlers
 */
// let intentMap = new Map();
app.intent('Default Welcome Intent', welcome);
app.intent('Default Fallback Intent', fallback);
app.intent('Default Welcome Intent - EmailVerifier', emailVerified)
app.intent('Notes', noteRetriever);
app.intent('Assessment', assesment);
app.intent('AssessmentFirstQuestion', assesmentFirstQuestion);
app.intent('AssessmentSecondQuestion', assessmentSecondQuestion);
app.intent('doubtClarification', doubtSolver);
app.intent('doubtClarificationText', doubtSolver);
// conv.handleRequest(intentMap);
// });
