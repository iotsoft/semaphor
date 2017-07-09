import * as http from 'http';
import { createServiceBusService, ServiceBusService } from 'azure';
import { Board, BoardOptions, Led } from 'johnny-five';
import { exec } from 'child_process';
const azure = require('azure-sb');
const Chip = require('chip-io');

class Config {
  busConnection: string = process.env['CHIP_BUS_CONN_STRING'];
  hostStartUpHookEndPoint: string = process.env['CHIP_HOST_STARTUP_ENDPOINT_STRING'];
  startUpHookEndPoint: string = process.env['CHIP_STARTUP_ENDPOINT_STRING'];
}
class SemaphorApp {
  private board = new Board(<BoardOptions>{
    io: new Chip()
  });
  private ledSuccess = new Led(<any>'XIO-P7');
  private ledFailed = new Led(<any>'XIO-P6');
  private ledWarning = new Led(<any>'XIO-P5');
  private listenInterval = 5000;
  private connString: string;
  private serviceBusService: any;
  private topic = 'builds-notification-topic';
  private subscription = 'builds-notification-subscr-one';

  constructor(private config: Config) {
    this.connString = this.config.busConnection;
    this.serviceBusService = azure.createServiceBusService(this.connString);
    this.board.on('ready', () => {

      this.startUp();

      // Start listening every 5 sec
      setInterval(() => { this.checkForMessages(); }, this.listenInterval);

    });
  }

  private buildWarning(message) {
    (<any>(this.ledSuccess)).stop().off();
    (<any>(this.ledFailed)).stop().off();
    this.ledWarning.blink(1000);
    this.speak(message);
  }
  private buildFailed(): void {
    (<any>(this.ledSuccess)).stop().off();
    (<any>(this.ledWarning)).stop().off();
    this.ledFailed.blink(500);
    this.speak('failed');
  }

  private buildSuccess(): void {
    (<any>(this.ledFailed)).stop().off();
    (<any>(this.ledWarning)).stop().off();
    this.ledSuccess.blink(500);
    this.speak('success');
  }

  private speak(text): void {
    exec(`espeak  'Build ${text}' -g 10 -s 120`, function (err, stdout, stderr) {
      console.log(stdout);
    });
  }
  private checkForMessages(): void {
    this.serviceBusService.receiveSubscriptionMessage(this.topic, this.subscription, { isPeekLock: false }, (error, receivedMessage) => {
      if (!error) {
        // Message received and deleted
        console.log('RESPONSE::', receivedMessage.body);
        const status = JSON.parse(receivedMessage.body).status;
        switch (status) {
          case 'Failed':
            console.log('Build Failed');
            this.buildFailed();
            break;
          case 'Passed':
            console.log('Build Succeeded');
            this.buildSuccess();
            break;
          default:
            this.buildWarning(status);


        }
      } else {
        console.log('-----STATUS THE SAME-----');
      }
    });
  }
  private startUp(): void {
    const options = {
      host: this.config.hostStartUpHookEndPoint,
      path: this.config.startUpHookEndPoint
    };

    const callback = function (response) {
      let str = '';

      // another chunk of data has been recieved, so append it to `str`
      response.on('data', function (chunk) {
        str += chunk;
      });

      // the whole response has been recieved, so we just print it out here
      response.on('end', function () {
        console.log(str);
      });
    };

    http.request(options, callback).end();
  }
}

// Boot App
const App = new SemaphorApp(new Config());
