#!/usr/bin/env node

// Channel ID is on the the browser URL.: https://mycompany.slack.com/messages/MYCHANNELID/

// CONFIGURATION #######################################################################################################

const channel = process.env.SLACK_CHANNEL_ID;
const token = process.env.SLACK_TOKEN; // You can learn it from: https://api.slack.com/custom-integrations/legacy-tokens
const NonDeletedUserIds = process.env.NON_DELETED_USER_IDS.split(',');  // delete messages except from Laura Moss and Anne S
const processingInterval = +process.env.PROCESSING_INTERVAL || 60000; // default to 1 minute

// GLOBALS #############################################################################################################

if (!channel) {
    console.log('Error. Must set an env var for slack channel ID');
    process.exit(1);
} else if (!token) {
    console.log('Error. Must set an env var for slack token');
    process.exit(1);
}

const https         = require('https');
const baseApiUrl    = 'https://slack.com/api/';
const messages      = [];
const historyApiUrl = baseApiUrl + 'conversations.history?token=' + token + '&count=1000&channel=' + channel + '&cursor=';
const deleteApiUrl  = baseApiUrl + 'chat.delete?token=' + token + '&channel=' + channel + '&ts='
let   delay         = 300; // Delay between delete operations in milliseconds
let   nextCursor    = '';

// ---------------------------------------------------------------------------------------------------------------------

function deleteMessage() {

    if (messages.length == 0) {

        if (nextCursor) {
            processHistory();
        }

        return;
    }

    const ts = messages.shift();
    console.log('Deleting messages for ' + ts)

    https.get(deleteApiUrl + ts, function (res) {

        let body = '';

        res.on('data', function (chunk) {
            body += chunk;
        });

        res.on('end', function() {
            const response    = JSON.parse(body);
            let   waitASecond = false;

            if (response.ok === true) {
                console.log(ts + ' deleted!');
            } else if (response.ok === false) {
                console.log(ts + ' could not be deleted! (' + response.error + ')');

                if (response.error === 'ratelimited') {
                    waitASecond = true;
                    delay += 100; // If rate limited error caught then we need to increase delay.
                    messages.unshift(ts);
                }
            }

            if (waitASecond) {
                setTimeout(() => setTimeout(deleteMessage, delay), 1000);
            } else {
                setTimeout(deleteMessage, delay);
            }
        });
    }).on('error', function (e) {
        console.error("Got an error: ", e);
    });
}

// ---------------------------------------------------------------------------------------------------------------------

function processHistory() {
  console.log('Processing history')

    https.get(historyApiUrl + nextCursor, function(res) {

        let body = '';
    
        res.on('data', function (chunk) {
            body += chunk;
        });
    
        res.on('end', function () {

            nextCursor = '';
    
            const response = JSON.parse(body);

            if (response.messages && response.messages.length > 0) {
              console.log(response.messages)

                if (response.has_more) {
                    nextCursor = response.response_metadata.next_cursor;
                }

                for (let i = 0; i < response.messages.length; i++) {
                  const message = response.messages[i];

                  if (!NonDeletedUserIds.includes(message.user)) {
                    messages.push(message.ts);
                  }
                }

              deleteMessage();
            }
        });
    }).on('error', function (e) {
          console.error("Got an error: ", e);
    });
  console.log('All messages have been processed');
}

// ---------------------------------------------------------------------------------------------------------------------

setInterval(processHistory, processingInterval);
processHistory();
