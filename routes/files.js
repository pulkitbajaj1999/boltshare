const path = require('path')
const express = require('express')
const router = express.Router()
const { v4: uuidv4 } = require('uuid')

const File = require('../models/file')
const sendMail = require('../services/emailService')

const multer = require('multer')
let storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads'),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${path.extname(file.originalname)}`
    console.log('uniqueName: ', uniqueName)
    return cb(null, uniqueName)
  },
})

let upload = multer({
  storage,
  limit: { fileSize: 5 * 1024 * 1024 },
}).single('file')

// get upload-file page
router.get('/upload', (req, res, next) => {
  const baseURL = process.env.APP_BASE_URL
  return res.render('upload', {
    pageStyle: 'upload-style.css',
    baseURL: baseURL,
    uploadURL: `${baseURL}/files/upload`,
    emailURL: `${baseURL}/files/send`,
  })
})

// upload file to server
router.post('/upload', (req, res, next) => {
  // store
  upload(req, res, async (err) => {
    console.log('FILE:', req.file)
    // validate file
    if (!req.file) {
      return res.json({ error: 'File is required to upload!' })
    }

    if (err) {
      return res.status(500).send({ error: err.message })
    }
    const file = new File({
      filename: req.file.filename,
      uuid: uuidv4(),
      path: req.file.path,
      size: req.file.size,
    })
    const response = await file.save()
    return res.json({
      file: `${process.env.APP_BASE_URL}/files/${response.uuid}`,
    })
  })
})

// send mail
router.post('/send', async (req, res, next) => {
  console.log('body:', req.body)
  const { uuid, sender, emailTo } = req.body
  if (!uuid || !sender || !emailTo) {
    return res.status(402).send('All fields are required')
  }
  const file = await File.findOne({ uuid: uuid })
  if (!file) {
    return res.status(402).send('No file of given uuid')
  }
  if (file.sender) {
    return res.status(402).send('Email already sent')
  } else {
    file.sender = sender
    file.receiver = emailTo
    const response = await file.save()
    await sendMail({
      from: `boltShare <${sender}>`,
      to: emailTo,
      subject: 'Bolt filesharing',
      text: `${sender} has shared a file with you`,
      html: require('../services/emailTemplate')({
        sender: sender,
        downloadLink: `${process.env.APP_BASE_URL}/files/${file.uuid}`,
        size: parseInt(file.size / 1000) + 'KB',
        expires: '24 hours',
        baseURL: process.env.APP_BASE_URL,
      }),
    })
      .then((resultInfo) => {
        console.log('mail sent result:', resultInfo)
        return res.status(200).json({ success: true })
      })
      .catch((err) => {
        return res.status(500).json({
          err: 'Internal Server Error',
        })
      })
  }
})

// get file-info page
router.get('/:uuid', async (req, res, next) => {
  try {
    const file = await File.findOne({
      uuid: req.params.uuid,
    })
    if (!file) {
      return res.render('download', {
        error: 'Link Expired!',
        pageStyle: 'download-style.css',
      })
    }
    return res.render('download', {
      fileName: file.filename,
      fileSize: file.size,
      downloadLink: `${process.env.APP_BASE_URL}/files/download/${file.uuid}`,
      pageStyle: 'download-style.css',
    })
  } catch (err) {
    return res.render('download', {
      error: 'Something went wrong!',
      pageStyle: 'download-style.css',
    })
  }
})

// download file
router.get('/download/:uuid', async (req, res, next) => {
  const file = await File.findOne({
    uuid: req.params.uuid,
  })
  if (!file) {
    return res.render('download', {
      error: 'Link Expired!',
      pageStyle: 'download-style.css',
    })
  }
  const filePath = path.join(__dirname, '..', file.path)
  return res.download(filePath)
})

module.exports = router
