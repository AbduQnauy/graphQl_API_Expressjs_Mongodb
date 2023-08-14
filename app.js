const express = require('express')
const path = require('path')
const mongoose = require('mongoose')
const multer = require('multer')
const { graphqlHTTP } = require('express-graphql')
const graphqlSchema = require('./graphql/schema')
const graphqlResolver = require('./graphql/resolvers')
const auth = require('./middleware/auth')
const { clearImage } = require('./util/file')

const app = express()
// //////////////////Storage Engine Setup////////////////////////
const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'images')
  },
  filename: (req, file, cb) => {
    cb(
      null,
      `${new Date().toISOString().replace(/^202|[-:TZ]/g, '')}${
        file.originalname
      }`
    )
  },
})

const fileFilter = (req, file, cb) => {
  if (
    file.mimetype === 'image/png' ||
    file.mimetype === 'image/jpg' ||
    file.mimetype === 'image/jpeg'
  ) {
    cb(null, true)
  } else {
    cb(null, false)
  }
}
app.use(express.json())

app.use(
  multer({ storage: fileStorage, fileFilter: fileFilter }).single('image')
)

app.use('/images', express.static(path.join(__dirname, 'images')))
// CORS set headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200)
  }
  next()
})

app.use(auth)

app.put('/post-image', (req, res, next) => {
  if (!req.isAuth) {
    next(new Error('Not Authenticated!'))
  }
  if (!req.file) {
    return res.status(200).json({ message: 'No file provided!' })
  }
  if (req.body.oldPath) {
    clearImage(req.body.oldPath)
  }
  return res
    .status(201)
    .json({ message: 'File stored', filePath: '/' + req.file.path })
})

app.use(
  '/graphql',
  graphqlHTTP({
    schema: graphqlSchema,
    rootValue: graphqlResolver,
    graphiql: true,
    customFormatErrorFn(error) {
      if (!error.originalError) return error
      const data = error.originalError.data
      const message = error.message || 'An error occurred'
      const code = error.originalError.code || 500
      return { message: message, status: code, data: data }
    },
  })
)
app.use((error, req, res, next) => {
  console.log(error)
  res
    .status(error.statusCode || 500)
    .json({ message: error.message, data: error.data })
})

mongoose
  .connect(
    'mongodb://127.0.0.1:27017/messages_graphQL?directConnection=true&serverSelectionTimeoutMS=2000&appName=mongosh+1.10.1'
  )
  .then((result) => {
    app.listen(8080)
    console.log('Connected')
  })
  .catch((err) => console.error(err))
