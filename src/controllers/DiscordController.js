const axios = require('axios')
const jwt = require('jsonwebtoken')

const { Users } = require('../models')

const { generateAPIToken, generateKey } = require('../utils')

const uri = encodeURIComponent(`${process.env.host_url}/login/callback`)

function redirect() {
  return function (request, reply) {
    return reply.redirect(
      301,
      `https://discordapp.com/api/oauth2/authorize?client_id=${process.env.discord_client_id}&scope=identify&response_type=code&redirect_uri=${uri}`,
    )
  }
}

function callback() {
  return async function (request, reply) {
    if (!request.query.code) {
      return reply.code(400).send({
        status: 400,
        error: 'Bad Request',
        message: 'Code query missing',
      })
    }

    try {
      const { data: authPayload } = await axios.post(
        `https://discordapp.com/api/oauth2/token?grant_type=authorization_code&redirect_uri=${uri}`,
        `code=${request.query.code}`,
        {
          auth: {
            username: process.env.discord_client_id,
            password: process.env.discord_client_secret,
          },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      )

      const { data: userPayload } = await axios.get(
        'http://discordapp.com/api/users/@me',
        {
          headers: {
            Authorization: `Bearer ${authPayload.access_token}`,
          },
        },
      )
      const user = await Users.findOne({ where: { user_id: userPayload.id } })

      if (user) {
        await Users.update(
          {
            user_name: userPayload.username,
            user_avatar: userPayload.avatar,
            user_token: authPayload.access_token,
            user_token_refresh: authPayload.refresh_token,
          },
          {
            where: { user_id: userPayload.id },
          },
        )
      } else {
        const key = generateKey()
        const token = generateAPIToken(userPayload.id, key, 100)

        await Users.create({
          user_id: userPayload.id,
          user_name: userPayload.username,
          user_avatar: userPayload.avatar,
          user_token: authPayload.access_token,
          user_token_refresh: authPayload.refresh_token,
          token_key: key,
          token,
          limit: 100,
        })
      }

      const token = jwt.sign(
        authPayload.access_token,
        process.env.jwt_encryption_web,
      )
      reply.setCookie('auth', token).redirect('/account')
    } catch (error) {
      console.error('Discord-Auth', error)
    }
  }
}

module.exports = {
  redirect,
  callback,
}
