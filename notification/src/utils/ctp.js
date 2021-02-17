const fetch = require('node-fetch')
const { merge } = require('lodash')
const { createClient } = require('@commercetools/sdk-client')
const {
  createAuthMiddlewareForClientCredentialsFlow,
} = require('@commercetools/sdk-middleware-auth')
const {
  createUserAgentMiddleware,
} = require('@commercetools/sdk-middleware-user-agent')
const { createHttpMiddleware } = require('@commercetools/sdk-middleware-http')
const { createQueueMiddleware } = require('@commercetools/sdk-middleware-queue')
const { createRequestBuilder } = require('@commercetools/api-request-builder')
const packageJson = require('../../package.json')

function createCtpClient({
  clientId,
  clientSecret,
  projectKey,
  concurrency = 10,
}) {
  const AUTH_HOST = process.env.CTP_AUTH_URL
  const API_HOST = process.env.CTP_HOST
  const authMiddleware = createAuthMiddlewareForClientCredentialsFlow({
    host: AUTH_HOST,
    projectKey,
    credentials: {
      clientId,
      clientSecret,
    },
    fetch,
  })

  const userAgentMiddleware = createUserAgentMiddleware({
    libraryName: packageJson.name,
    libraryVersion: `${packageJson.version}/notification`,
    contactUrl: packageJson.homepage,
    contactEmail: packageJson.author.email,
  })

  const httpMiddleware = createHttpMiddleware({
    maskSensitiveHeaderData: true,
    host: API_HOST,
    enableRetry: true,
    fetch,
  })

  const queueMiddleware = createQueueMiddleware({
    concurrency,
  })

  return createClient({
    middlewares: [
      authMiddleware,
      userAgentMiddleware,
      httpMiddleware,
      queueMiddleware,
    ],
  })
}

async function getAccessToken() {
  const res = await fetch(`${process.env.CTP_AUTH_URL}/oauth/token?grant_type=client_credentials`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${process.env.CTP_USER_KEY}`
    },
    body: '',
  })
  return res.json()
}

async function setUpClient(config) {
  const { access_token: accessToken } = await getAccessToken()
  const _headers = {
    Authorization: `Bearer ${accessToken}`,
  }
  const ctpClient = createCtpClient(config.ctp)
  const customMethods = {
    get builder() {
      return getRequestBuilder(config.ctp.projectKey)
    },

    delete(uri, id, version) {
      return ctpClient.execute(
        this.buildRequestOptions({
          uri: uri.byId(id).withVersion(version).build(),
          method: 'DELETE',
          headers: _headers,
        })
      )
    },

    create(uri, body) {
      return ctpClient.execute(
        this.buildRequestOptions({
          uri: uri.build(),
          method: 'POST',
          body,
          headers: _headers,
        })
      )
    },

    update(uri, id, version, actions) {
      const body = {
        version,
        actions,
      }
      return ctpClient.execute(
        this.buildRequestOptions({
          uri: uri.byId(id).build(),
          method: 'POST',
          body,
          headers: _headers,
        })
      )
    },

    fetch(uri) {
      const foo = this.buildRequestOptions({
        uri: uri.build(),
        headers: _headers,
      })
      return ctpClient.execute(foo)
    },

    fetchById(uri, id) {
      const foo = this.buildRequestOptions({
        uri: uri.byId(id).build(),
        headers: _headers,
      })
      return ctpClient.execute(foo)
    },

    fetchByKey(uri, key) {
      const foo = this.buildRequestOptions({
        uri: uri.byKey(key).build(),
        headers: _headers,
      })
      return ctpClient.execute(foo)
    },

    fetchBatches(uri, callback, opts = { accumulate: false }) {
      return this.process(
        this.buildRequestOptions({
          uri: uri.build(),
          headers: _headers,
        }),
        (data) => callback(data.body.results),
        opts
      )
    },

    buildRequestOptions({
      uri,
      method = 'GET',
      body = undefined,
      headers = {},
    }) {
      return {
        uri,
        method,
        body,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...headers,
        },
      }
    },
  }
  return merge(customMethods, ctpClient)
}

function getRequestBuilder(projectKey) {
  return createRequestBuilder({ projectKey })
}

/**
 * Compares transaction states
 * @param currentState state of the transaction from the CT platform
 * @param newState state of the transaction from the Adyen notification
 * @return number 1 if newState can appear after currentState
 * -1 if newState cannot appear after currentState
 * 0 if newState is the same as currentState
 * @throws Error when newState and/or currentState is a wrong transaction state
 * */
function compareTransactionStates(currentState, newState) {
  const transactionStateFlow = {
    Initial: 0,
    Pending: 1,
    Success: 2,
    Failure: 2,
  }
  if (
    !transactionStateFlow.hasOwnProperty(currentState) ||
    !transactionStateFlow.hasOwnProperty(newState)
  )
    throw Error(
      'Wrong transaction state passed. ' +
        `currentState: ${currentState}, newState: ${newState}`
    )

  return transactionStateFlow[newState] - transactionStateFlow[currentState]
}

module.exports = {
  get: async (config) => setUpClient(config),
  compareTransactionStates,
}
