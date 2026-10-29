# EvoAgro

MVP EvoAgro — HackITBA 2026.

A continuacion, se detalla como ejecutar localmente el proyecto.

## Frontend

Primero, se debe contar con `NodeJS` para poder utilizar el comando `npm`. 
Luego, dentro de la carpeta `frontend/` instalar dependencias:

```bash
npm install
```

### Variables de entorno

Se debe contar con un archivo `.env.local` con las variables de entorno requeridas, estas son:

- SUPABASE_SERVICE_ROLE_KEY(Desde el panel de Supabase)
- EOS_API_KEY(Desde el panel de EOSDA API)
- NEXT_PUBLIC_SUPABASE_URL(Desde el panel de Supabase)
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY(Desde el panel de Supabase)
- ML_ADMIN_SECRET(Una clave cualquiera que inventen, protege el entrenamiento del modelo)
- CRON_SECRET(Opcional, solo en Vercel: habilita el re-entrenamiento semanal automático)

Se deben completar con los valores obtenidos de las distintas herramientas. Por ejemplo:

```
SUPABASE_SERVICE_ROLE_KEY=sb_secret_XXXXXXXXXXXXXXXXXX
EOS_API_KEY=apk.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_SUPABASE_URL=https://XXXXXXXXX.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=sb_publishable_XXXXXXXXXXXXXXXXXXXXxxX
ML_ADMIN_SECRET=una-clave-larga-y-secreta
```

--- 

Finalmente, levantar el servidor:

```bash
npm run dev
```

Por defecto escucha en `http://localhost:3000`.

## Predicción de rinde (ML)

La predicción corre dentro de la app de Next.js (`frontend/`), sin servicios aparte, en tres capas:

1. **Regional (siempre activa)**: rinde esperable del cultivo en el departamento del lote para su
   campaña, calculado con las **Estimaciones Agrícolas del MAGyP** (rinde real por cultivo, campaña
   y departamento, 2000/01 en adelante). El lote se ubica en su departamento con la API pública de
   Georreferenciación (`apis.datos.gob.ar/georef`); si no se puede ubicar, se usa la provincia o el
   promedio nacional. Código: `frontend/lib/ml/regional-yield.ts`; datos procesados:
   `frontend/data/regional-yields.json`.
2. **Por lote (cuando hay cosechas propias)**: red neuronal (32 → 16 → 1, `frontend/lib/ml/yield-model.ts`)
   entrenada con las cosechas de la tabla `logs`, que recibe el rinde regional como variable y aprende
   cuánto se desvía cada lote (riego, fertilización, NDVI, etc.). Se necesitan al menos 20 cosechas y
   solo se usa si en validación mejora al regional solo.
3. **Clima de la campaña**: ajusta según la lluvia y la temperatura ya observadas del período crítico
   del cultivo (p. ej. diciembre–enero para maíz, enero–febrero para soja), comparadas con lo normal
   del departamento. El clima sale de NASA POWER (diario, público, sin clave; ~1 semana de demora).
   Los meses que todavía no pasaron se completan con lo normal, así que el ajuste arranca neutro al
   sembrar y se define a medida que avanza la campaña. Código: `frontend/lib/ml/weather-effect.ts`
   y `frontend/lib/server/weather.ts`; modelo: `frontend/data/weather-model.json`.

La predicción se calcula al crear un lote, al iniciar un nuevo ciclo y al cambiarle el cultivo, y se
**recalcula cada semana** para todos los lotes activos (cron de Vercel sobre `/api/ml/train`): cuando
cambia, se agrega una fila a `plot_prediction`, así el historial muestra cómo evoluciona con el clima.
Predecir no necesita credenciales extra; el recálculo semanal y el entrenamiento usan
`SUPABASE_SERVICE_ROLE_KEY`.

### Qué tan buena es la capa regional

Evaluada prediciendo campañas que el método no vio (2022/23 – 2025/26), con error ponderado por
superficie:

| Método | Error |
|---|---|
| Modelo regional | 23,0 % (±873 kg/ha) |
| Promedio del departamento, últimas 5 campañas | 22,0 % |
| Igual que la campaña anterior | 26,0 % |
| Promedio nacional del cultivo | 27,3 % |

En campañas normales el error es de 11–20 %; en la sequía 2022/23 sube a ~40 % para todos los
métodos que solo miran el pasado. Frente al promedio simple, la ventaja del modelo regional es la
cobertura: da un valor razonable aunque el departamento tenga pocas campañas o ninguna.

### Qué agrega el clima

Evaluado igual (coeficientes con campañas hasta 2021/22; qué fracción del efecto aplicar, elegida
con 2016/17–2021/22 sin mirar la evaluación), con la campaña completa ya observada:

| Campaña | Solo regional | Con clima |
|---|---|---|
| 2022/23 (sequía) | 41,0 % | 35,4 % |
| 2023/24 | 20,4 % | 21,1 % |
| 2024/25 | 14,5 % | 14,5 % |
| 2025/26 (cultivos de invierno) | 25,0 % | 21,7 % |
| **Total** | **24,1 %** | **22,6 %** |

Y en los cultivos de verano 2025/26, que el modelo no vio (clima diario de NASA, como en la app):
maíz 15,9 % → 14,0 %, girasol 13,4 % → 13,3 %, sorgo 13,6 % → 13,2 %.

La mejora es moderada en promedio y se concentra en los años extremos. Se aplica a mitad de efecto
porque con el efecto completo la sequía mejora más (41 % → 24 %) pero los años normales empeoran: el
clima mensual en una grilla de ~50 km capta los extremos y mete ruido en lo demás.

### Actualizar los datos del MAGyP

Descargar de [datosestimaciones.magyp.gob.ar](https://datosestimaciones.magyp.gob.ar) el CSV de todos
los cultivos a nivel departamento y, desde `frontend/`:

```bash
npm run data:regional -- /ruta/a/Estimaciones.csv
```

Regenera `data/regional-yields.json` y vuelve a correr la evaluación. Después hay que regenerar el
modelo de clima (depende de esos datos; si no coinciden, la app no aplica el ajuste por clima):

```bash
npm run data:weather   # descarga ~340 puntos de NASA POWER (con caché en .cache/) y reajusta
```

### Entrenar el modelo por lote y recalcular predicciones

Con `SUPABASE_SERVICE_ROLE_KEY` configurada. Además de entrenar (si hay al menos 20 cosechas),
recalcula la predicción de todos los lotes activos con el clima observado hasta hoy:

```bash
# Desde frontend/, con .env.local completo
npm run ml:train
```

```bash
# Contra el deploy
curl -X POST https://TU-DOMINIO/api/ml/train -H "Authorization: Bearer $ML_ADMIN_SECRET"
```

En Vercel, si se define `CRON_SECRET`, esto corre solo todos los lunes (`vercel.json`). Sin
`CRON_SECRET`, las predicciones no se actualizan con el clima después de crear el lote.

Tests: `npm run test:yield-model`.

## Backend (legacy)

> El backend Python fue reemplazado por la predicción dentro de la app (sección anterior) y ya no es
> necesario para que la app funcione. Se conserva como referencia.

Debido a que no es posible integrar las liberias de TensorFlow con Supabase, se requiere levantar una API, 
hecha con **FastAPI**. Primero, se debe contar con `Python3` para utilizar el comando `pip`, luego en el directorio 
`backend/` se deben instalar las dependencias requeridas:

```
pip install -r requirements.txt
```

Luego, correr con:

```
fastapi run main.py
```

Por defecto escucha en `http://localhost:8000`.

> **Nota**: En caso de correr la API localmente, se debera cambiar la URL utilizada en las **Edge Functions** 
de Supabase por `http://localhost:8000`.

## Supabase

Hay muchas cosas que quedaron en Supabase, cualquier duda hacerla de lo implementado en dicha plataforma contactar a los participantes del 
equipo.