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

La predicción corre dentro de la app de Next.js (`frontend/`), sin servicios aparte, en dos capas:

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

La predicción se calcula al crear un lote, al iniciar un nuevo ciclo y al cambiarle el cultivo, y se
guarda en `plot_prediction` (con historial). La capa regional no necesita credenciales extra.

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
métodos, porque ninguno sabe cómo viene el clima de la campaña. Esa es la mejora pendiente: sumar
clima y NDVI de la campaña en curso. Frente al promedio simple, la ventaja del modelo regional es la
cobertura: da un valor razonable aunque el departamento tenga pocas campañas o ninguna.

### Actualizar los datos del MAGyP

Descargar de [datosestimaciones.magyp.gob.ar](https://datosestimaciones.magyp.gob.ar) el CSV de todos
los cultivos a nivel departamento y, desde `frontend/`:

```bash
npm run data:regional -- /ruta/a/Estimaciones.csv
```

Regenera `data/regional-yields.json` y vuelve a correr la evaluación.

### Entrenar el modelo por lote

Con `SUPABASE_SERVICE_ROLE_KEY` configurada. Además de entrenar, predice los lotes que todavía no
tenían predicción:

```bash
# Desde frontend/, con .env.local completo
npm run ml:train
```

```bash
# Contra el deploy
curl -X POST https://TU-DOMINIO/api/ml/train -H "Authorization: Bearer $ML_ADMIN_SECRET"
```

En Vercel, si se define `CRON_SECRET`, se re-entrena solo todos los lunes (`vercel.json`).

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