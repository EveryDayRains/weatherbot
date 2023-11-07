import { model, Schema } from 'mongoose'

const UserScheme = new Schema({
    id: Number,
    favorites: []
})
export default model('user', UserScheme)