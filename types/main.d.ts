export interface SearchParams {
    q?: string
    lat?: number
    lon?: number
    units: 'metric' | 'imperial'
    lang?: string
    appid?: string
}