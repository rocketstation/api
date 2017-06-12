const paginate = (props = {}) => {
  const options = Object.assign({ current: 1, limit: 15 }, props)
  return ['paginate', !!props.isRequired, [['current', 'number', { default: options.current }], ['limit', 'number', { default: options.limit }]]]
}

export default paginate
