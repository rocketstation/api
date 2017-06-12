import Bluebird from 'bluebird'

const load = () => {
  let { NODE_ENV: env } = process.env
  if (!['p', 'i', 'production', 'integration'].includes(env)) env = 'development'
  const map = {
    p: 'production',
    i: 'integration'
  }
  return Bluebird.resolve(map[env] || env)
}

export default load
