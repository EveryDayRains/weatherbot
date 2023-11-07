import { Api, Bot, BotError, Context, GrammyError, HttpError, InlineKeyboard, RawApi } from 'grammy'
import axios from 'axios'
import mongoose from 'mongoose'
import UserScheme from './schemes/User.scheme'
import { SearchParams } from './types/main'
require('dotenv').config()



// инициализируем подключение к бд
mongoose.connect(process.env.MONGO_URI, {})
    .then(() => console.log('MongoDB connection successful!'))
    .catch((err) => console.error(err))

// создаем переменную бота
const bot: Bot<Context, Api<RawApi>> = new Bot(process.env.BOT_TOKEN)

// функция на генерацию текста погоды
function weatherText(response: any): string {
    return `🏙️ Погода в ${response.data.name}
🌡️ Температура: ${response.data.main.temp} °C
💧 Влажность: ${response.data.main.humidity}%
🌫️ Видимость: ${response.data.visibility} метров
💨 Скорость ветра: ${response.data.wind.speed} Метров/секунду`;
}

// стартовая команда
bot.command('start', async (ctx: Context) => {
    // добавляем в бд человека если его ещё нет
    const userEntity = await UserScheme.findOne({ id: ctx.from?.id })
    if (!userEntity) await UserScheme.create({ id: ctx.from?.id })
    await ctx.reply('Привет!\nДля начала работы напиши название города либо отправь мне свою текущую геопозиции!.', {
        reply_markup: new InlineKeyboard().text('Избранные города', 'favorites')
    })
})

// команда избранные
bot.command('favorites', async (ctx: Context) => {
    const userEntity = await UserScheme.findOne({ id: ctx.from?.id })
    const favoritesKeyBoard: InlineKeyboard = new InlineKeyboard()

    userEntity!.favorites.forEach(x => {
        favoritesKeyBoard.text(x, `city::${x}`).row()
    })

    if (!userEntity!.favorites.length) return ctx.reply('У вас нет избранных городов!')

    await ctx.reply('Список ваших избранных городов', {
        reply_markup: favoritesKeyBoard
    })
})

// получаем сообщения
bot.on('message', async (ctx: Context) => {
    let params: SearchParams = {
        units: 'metric',
        appid: process.env.APPID,
        lang: ctx.from?.language_code
    }
    params = ctx.message?.location ? {
        ...params,
        lat: ctx.message?.location.latitude,
        lon: ctx.message?.location.longitude
    } : {
        ...params,
        q: ctx.message?.text
    }
    try {
        const responseMessageEntity = await axios.get(`https://api.openweathermap.org/data/2.5/weather`, {
            params
        })

        return ctx.reply(weatherText(responseMessageEntity), {
            reply_markup: new InlineKeyboard().text('❤️ Добавить в избранные', `favorite::${responseMessageEntity.data.name}`)
        })

    } catch (err: any) {
        if (err.response.status === 404) {
            return ctx.reply('Город не найден!')
        }
    }
})

// получаем нажатия на кнопки
bot.on('callback_query:data', async (ctx: Context) => {
    const data: string | undefined = ctx.callbackQuery?.data
    const userEntity = await UserScheme.findOne({ id: ctx.from?.id })
    switch (data?.split('::')[0]) {
        // если нажали на кнопку добавить в избранное
        case 'favorite':
            if (userEntity?.favorites.includes(data?.split('::')[1])) {
                return ctx.answerCallbackQuery('❌ Город уже в избранном!')
            }

            userEntity?.favorites.push(data?.split('::')[1])
            await userEntity?.save()
            return ctx.editMessageText(<string>ctx.update.callback_query!.message!.text, {
                reply_markup: new InlineKeyboard().text('💔 Удалить из избранного', `deleteFavorite::${data?.split('::')[1]}`)
            })

        // если нажали на кнопку избранные
        case 'favorites':
            const favoritesKeyBoard: InlineKeyboard = new InlineKeyboard()

            userEntity!.favorites.forEach(x => {
                favoritesKeyBoard.text(x, `city::${x}`).row()
            })

            if (!userEntity!.favorites.length) return ctx.editMessageText('У вас нет избранных городов!')

            await ctx.editMessageText('Список ваших избранных городов', {
                reply_markup: favoritesKeyBoard
            })
            break
        // если нажали на кнопку города в избранном
        case 'city':
            const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${data?.split('::')[1]}&units=metric&appid=ae1c9eb796b656ea1d4b725937875170&lang=${ctx.from?.language_code}`)
            await ctx.editMessageText(`🏙Погода в ${response.data.name}\n🌡️Температура: ${response.data.main.temp} °C\n💧Влажность: ${response.data.main.humidity}%\n🌫️Видимость: ${response.data.visibility} метров\n💨 Скорость ветра: ${response.data.wind.speed} Метров/Секунду`, {
                reply_markup: new InlineKeyboard().text('💔 Удалить из избранного', `deleteFavorite::${response.data.name}`)
            })
            break
        // если нажали на кнопку удалить из избранного
        case 'deleteFavorite':
            const findIndex: number = userEntity!.favorites.findIndex(x => x === data?.split('::')[1])
            userEntity!.favorites.splice(findIndex, 1)
            await userEntity!.save()
            await ctx.editMessageText(<string>ctx.update.callback_query!.message!.text, {
                reply_markup: new InlineKeyboard().text('❤️ Добавить в избранное', `favorite::${data?.split('::')[1]}`)
            })
            break
    }

})

// обработка ошибок
bot.catch((err: BotError<Context>): void => {
    const ctx = err.ctx
    console.error(`Error while handling update ${ctx.update.update_id}:`)
    const e = err.error
    if (e instanceof GrammyError) {
        console.error('Error in request:', e.description)
    } else if (e instanceof HttpError) {
        console.error('Could not contact Telegram:', e)
    } else {
        console.error('Unknown error:', e)
    }
})

// запускаем бота
bot.start().then(r => console.log('Bot ready'))


declare global {
    namespace NodeJS {
        interface ProcessEnv {
            BOT_TOKEN: string
            MONGO_URI: string
            APPID: string
        }
    }
}