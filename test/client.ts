import 'mocha';
import should from 'should';
import { MyPromise } from 'the-promise';

import { WebSocketClient } from '../src';

const RUN_TEST_DEBUG = (process.env.RUN_TEST_DEBUG == 'true');
const PAUSE_TIMEOUT = RUN_TEST_DEBUG ? 100 * 1000 : 1 * 1000;
const TEST_TIMEOUT = PAUSE_TIMEOUT + 2000;

describe('client', () => {
   
    it('construct', () => {
        const client = new WebSocketClient('sample-socket', { 
            path: 'http://localhost:3333/socket',
            transports: ['websocket']
        })
        client.header("Fixed", "Foo1");
        client.header("Function", () => "Foo2");
        client.header("Promise", MyPromise.delay(10).then(() => "Foo3"));
        client.run();

        return MyPromise.delay(PAUSE_TIMEOUT)
            .then(() => {
                should(client.finalHeaders).be.eql({ Fixed: 'Foo1', Function: 'Foo2', Promise: 'Foo3' });
            })
            .then(() => {
                client.close();
            });
    })
    .timeout(TEST_TIMEOUT)
    ;
});
