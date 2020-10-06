import express from 'express'
import http from 'http'
import socketio from 'socket.io'
import helmet from 'helmet'
import Docker from 'dockerode'
import { v4 as uuidv4 } from 'uuid'
import logger from './logger'
import { isLeft } from 'fp-ts/lib/These'
import reporter from 'io-ts-reporters'
import { ExerciseRequestModel } from './models/ExerciseRequest'

const docker = new Docker({ socketPath: '/var/run/docker.sock' })

const app = express()
app.use(helmet())

const server = new http.Server(app)
const io = socketio(server)

const port = process.env.PORT || 80

app.get('/', (_req, res) => {
  res.send(`<pre>SOINTU server running on port ${port}</pre>`)
})

const pullImage = (tag: string) => new Promise((resolve, reject) => {
  docker.pull(tag, {}, (err, _res) => {
    if (err) {
      reject(err)
    } else {
      resolve(true)
    }
  })
})

app.get('/health', (_req, res) => {
  docker.ping((err, cb) => {
    if (err) {
      res.sendStatus(500)
    } else {
      const result = Buffer.from(cb).toString('utf-8')
      if (typeof result === 'string' && result === 'OK') {
        res.sendStatus(200)
      } else {
        res.sendStatus(500)
      }
    }
  })
})

io.on('connection', (socket) => {
  socket.on('init', (_data) => {
    logger.info('Received request to initialize sointu')
    socket.emit('init_send_uuid', { uuid: uuidv4() })
  })
  socket.on('submit_exercise', (data) => {
    const model = ExerciseRequestModel.decode(JSON.parse(data))
    if (isLeft(model)) {
      socket.emit('failed_to_submit_exercise', {
        errors: reporter.report(model)
      })
    } else {
      logger.debug('Received submission for exercise', { userId: model.right.userId, exerciseId: model.right.exerciseId })
      const submissionId = uuidv4()
      logger.debug('Created new submission', { submissionId })
      socket.emit('exercise_submitted', {
        submissionId,
        timestamp: +new Date()
      })
    }
  })
})

const tags = ['hayd/alpine-deno:1.0.0', 'python:3.6.12-alpine3.11']

const init = async () => {
  logger.info('Pulling runtimes from Docker hub...')
  await Promise.all(tags.map(async (tag) => {
    logger.info(`Pulling ${tag}`)
    return pullImage(tag)
  }))
  logger.info('Pulled images from Docker hub.')
  server.listen(port, undefined, async () => {
    logger.info(`sointu server running on port ${port}`)
  })
}
docker.version((err, cb) => {
  if (err) {
    logger.error(`Error: ${err.toString()}`)
    process.exit(1)
  } else {
    if (cb === undefined) {
      logger.error('Error: Could not get Docker API version')
      process.exit(1)
    } else {
      if (process.env.NODE_ENV !== 'production') {
        logger.info(`Docker Engine ${cb.Version} (${cb.Os} ${cb.Arch})`)
      }
      init()
    }
  }
})
