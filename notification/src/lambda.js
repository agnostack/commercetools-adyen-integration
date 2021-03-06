const ctp = require('./utils/ctp')
const handler = require('./handler/notification/notification.handler')
const config = require('./config/config')()
const logger = require('./utils/logger').getLogger()

const setup = require('./config/init/ensure-interface-interaction-custom-type')

let initialised = false

// TODO: add JSON schema validation:
// https://github.com/commercetools/commercetools-adyen-integration/issues/9
exports.handler = async function (event) {
  const data = JSON.parse(event.body)

  const ctpClient = await ctp.get(config)

  try {
    if (!initialised) {
      await setup.ensureInterfaceInteractionCustomType(ctpClient)
      initialised = true
    }

    await handler.processNotifications(data.notificationItems, ctpClient)
    return {
      notificationResponse: '[accepted]',
    }
  } catch (e) {
    logger.error(
      e,
      `Unexpected error when processing event ${JSON.stringify(event)}`
    )
    throw e
  }
}
