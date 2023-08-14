const { validationResult } = require('express-validator')
const fs = require('fs')
const path = require('path')
const Post = require('../models/post')
const User = require('../models/user')
const io = require('../socket')

exports.getPosts = (req, res, next) => {
  const currentPage = req.query.page || 1
  const perPage = 2
  let totalItems
  Post.find()
    .countDocuments()
    .then((count) => {
      totalItems = count
      return Post.find()
        .populate('creator')
        .sort({ createdAt: -1 })
        .skip((currentPage - 1) * perPage)
        .limit(perPage)
      // .populate('creator', 'name')
    })
    .then((posts) => {
      // console.log('Posts: ', posts)
      res.status(200).json({
        message: 'Posts are fetched Successfully',
        posts: posts,
        totalItems: totalItems,
      })
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500
      }
      next(err)
    })
}

exports.createPost = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const error = new Error('Validation failed, entered data is incorrect')
    error.statusCode = 422
    throw error
  }
  if (!req.file) {
    const error = new Error('No image provided')
    error.statusCode = 422
    next(error)
  }

  const imageUrl = `/${req.file.path}`
  const title = req.body.title
  const content = req.body.content
  let creator
  const post = new Post({
    title: title,
    content: content,
    imageUrl: imageUrl,
    creator: req.userId,
  })

  post
    .save()
    .then((result) => {
      console.log('Insertion in databse: ', result)
      return User.findById(req.userId)
    })
    .then((user) => {
      creator = user
      user.posts.push(post)
      return user.save()
    })
    .then((result) => {
      io.getIO().emit('posts', { action: 'create', post: post })
      res.status(201).json({
        message: 'Post created successfully',
        post: post,
        creator: { _id: creator._id, name: creator.name },
      })
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500
      }
      next(err)
    })
}

exports.getPost = (req, res, next) => {
  const postId = req.params.postId
  Post.findById(postId)
    .populate('creator')
    .then((post) => {
      if (!post) {
        const error = new Error('There is not post here')
        error.statusCode = 404
        throw error
      }
      res.status(200).json({ message: 'Post is found', post: post })
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500
      }
      next(err)
    })
}

exports.updatePost = (req, res, next) => {
  const postId = req.params.postId
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const error = new Error('Validation failed, entered data is incorrect')
    error.statusCode = 422
    throw error
  }
  const title = req.body.title
  const content = req.body.content
  let imageUrl = req.body.image

  if (req.file) {
    imageUrl = `/${req.file.path}`
  }
  if (!imageUrl) {
    const error = new Error('No image picked')
    error.statusCode = 422
    next(error)
  }
  Post.findById(postId)
    .populate('creator')
    .then((post) => {
      if (!post) {
        const error = new Error('There is not post here')
        error.statusCode = 404
        throw error
      }

      if (post.creator._id.toString() !== req.userId) {
        const error = new Error('Not Authorized')
        error.statusCode = 403
        next(error)
      }
      if (imageUrl) {
        if (imageUrl !== post.imageUrl) {
          clearImage(post.imageUrl)
          post.imageUrl = imageUrl
        }
      }
      post.title = title
      post.content = content
      return post.save()
    })
    .then((result) => {
      io.getIO().emit('posts', { action: 'update', post: result })
      res
        .status(200)
        .json({ message: 'Post updated successfully.', post: result })
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500
      }
      next(err)
    })
}

exports.deletePost = (req, res, next) => {
  const postId = req.params.postId
  const userId = req.userId

  Post.findById(postId)
    .populate('creator')
    .then((post) => {
      if (!post) {
        const error = new Error('There is not post here')
        error.statusCode = 404
        throw error
      }
      if (post.creator._id.toString() !== userId) {
        const error = new Error('Not Authorized')
        error.statusCode = 403
        throw error
      }
      // Check logged in user
      clearImage(post.imageUrl)
      return Post.findByIdAndRemove(postId)
    })
    .then((result) => {
      return User.find({ _id: userId }, 'posts -_id')
    })
    .then(([posts]) => {
      return posts['posts'].filter((post) => post.toString() !== postId)
    })
    .then((posts) => {
      return User.findByIdAndUpdate(userId, { posts: posts })
    })
    .then((_) => {
      io.getIO().emit('posts', { action: 'delete', post: postId })
      res.status(200).json({ message: 'Post Deleted.' })
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500
      }
      next(err)
    })
}

const clearImage = (filePath) => {
  filePath = path.join(__dirname, '..', filePath)
  fs.unlink(filePath, (err) => {
    if (err) console.log('Error while deleting image: ', err)
  })
}
