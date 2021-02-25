import 'mocha';
import should = require('should');
import { Promise } from 'the-promise';

import { WebSocketClient } from '../src';

const RUN_TEST_DEBUG = (process.env.RUN_TEST_DEBUG == 'true');
const PAUSE_TIMEOUT = RUN_TEST_DEBUG ? 100 * 1000 : 1 * 1000;
const TEST_TIMEOUT = PAUSE_TIMEOUT + 2000;

describe('client', () => {
   
    it('construct', () => {
        const client = new WebSocketClient({ 
            path: 'http://localhost:3333/socket',
        })
        client.run();

        return Promise.timeout(PAUSE_TIMEOUT)
            .then(() => {
                client.close();
            });
    })
    .timeout(TEST_TIMEOUT)
    ;
});
