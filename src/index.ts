/* eslint-disable quotes */
import express from 'express'
import http from 'http'
import socketio from 'socket.io'
import Docker from 'dockerode'
import { v4 as uuidv4 } from 'uuid'
import logger from './logger'
import { isLeft } from 'fp-ts/lib/These'
import reporter from 'io-ts-reporters'
import { ExerciseRequestModel } from './models/ExerciseRequest'
import { join } from 'path'

const docker = new Docker({ socketPath: '/var/run/docker.sock' })

const app = express()

const server = new http.Server(app)
const io = socketio(server)

const port = process.env.PORT || 80

app.use('/static', express.static(join(__dirname, 'static')))

app.get('/', (_req, res) => {
  res.sendFile(join(__dirname, 'index.html'))
})

const pullImage = (tag: string) =>
  new Promise((resolve, reject) => {
    docker.pull(tag, {}, (err, _res) => {
      if (err) {
        reject(err)
      } else {
        resolve(true)
      }
    })
  })

app.get('/health', (_req, res) => {
  docker
    .ping()
    .then((cb) => {
      const result = Buffer.from(cb).toString('utf-8')
      if (typeof result === 'string' && result === 'OK') {
        res.sendStatus(200)
      } else {
        res.sendStatus(500)
      }
    })
    .catch((_err) => {
      res.sendStatus(500)
    })
})

io.on('connection', (socket) => {
  socket.on('init', (_data) => {
    socket.emit('init_send_uuid', { userId: uuidv4() })
  })
  socket.on('submit_exercise', (data) => {
    const model = ExerciseRequestModel.decode(JSON.parse(data))
    if (isLeft(model)) {
      socket.emit('failed_to_submit_exercise', {
        errors: reporter.report(model)
      })
    } else {
      logger.debug('Received submission for exercise', {
        userId: model.right.userId,
        exerciseId: model.right.exerciseId
      })
      const submissionId = uuidv4()
      logger.debug('Created new submission', { submissionId })
      socket.emit('exercise_submitted', {
        submissionId,
        timestamp: +new Date()
      })
      // Temporary for now
      const Image = 'python:3.6.12-alpine3.11'
      logger.info(
        `Creating container sointu-${submissionId} with image '${Image}'`,
        { submissionId }
      )
      let auxContainer: Docker.Container
      docker
        .createContainer({
          Image,
          name: `sointu-${submissionId}`,
          NetworkDisabled: true,
          AttachStdin: false,
          AttachStdout: true,
          AttachStderr: true,
          OpenStdin: false,
          Tty: false,
          Cmd: ['which', `python`]
        })
        .then((container) => {
          logger.info(`Container sointu-${submissionId} created`)
          auxContainer = container
          auxContainer.attach({ stream: true, stdout: true, stderr: true }, function (_err, stream) {
            stream!.pipe(process.stdout)
          })
          return container.start()
        })
        .then(function (_startRes) {
          return auxContainer.stop()
        })
        .then(function (_stopRes) {
          logger.info(`Container sointu-${submissionId} stopped`)
          return auxContainer.remove()
        })
        .then(function (_removeRes) {
          logger.info(`Container sointu-${submissionId} removed`)
        })
        .catch(function (err) {
          logger.error(err.message, err.stack)
          socket.emit('exercise_runtime_error', {
            submissionId,
            timestamp: +new Date()
          })
        })
    }
  })
})

const tags = ['hayd/alpine-deno:1.0.0', 'python:3.6.12-alpine3.11']

const init = async () => {
  logger.info('Pulling runtimes from Docker hub...')
  await Promise.all(
    tags.map(async (tag) => {
      logger.info(`Pulling ${tag}`)
      return pullImage(tag)
    })
  )
  logger.info('Pulled images from Docker hub.')
  server.listen(port, undefined, async () => {
    logger.info(`sointu server running on port ${port}`)
  })
}
docker
  .version()
  .then((version) => {
    if (version === undefined) {
      logger.error('Error: Could not get Docker API version')
      process.exit(1)
    } else {
      if (process.env.NODE_ENV !== 'production') {
        logger.info(
          `Docker Engine ${version.Version} (${version.Os} ${version.Arch})`
        )
      }
      init()
    }
  })
  .catch((err) => {
    logger.error(`Error: ${err.toString()}`)
    process.exit(1)
  })
