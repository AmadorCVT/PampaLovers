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

La predicción corre dentro de la app de Next.js (`frontend/`), sin servicios aparte:

- **Modelo**: red neuronal densa (32 → 16 → 1) en TypeScript puro, en `frontend/lib/ml/yield-model.ts`.
  Las variables y su codificación están en `frontend/lib/yield-features.ts`.
- **Datos de entrenamiento**: todas las cosechas de la tabla `logs` (se agrega una fila cada vez que se
  cosecha un lote desde la app). Se necesitan al menos 20 cosechas con rinde.
- **Dónde se guarda**: Supabase Storage, bucket `models`, archivo `yield-model.json` (el bucket se crea
  solo si no existe).
- **Cuándo se predice**: al crear un lote, al iniciar un nuevo ciclo y al cambiarle el cultivo. El
  resultado se guarda en `plot_prediction` (con historial). Si todavía no hay modelo, el lote se crea
  igual, sin predicción.

Para entrenar (o re-entrenar) el modelo hay dos formas. Ambas, además, predicen los lotes que todavía
no tenían predicción:

```bash
# Desde frontend/, con .env.local completo
npm run ml:train
```

```bash
# Contra el deploy
curl -X POST https://TU-DOMINIO/api/ml/train -H "Authorization: Bearer $ML_ADMIN_SECRET"
```

En Vercel, si se define `CRON_SECRET`, el modelo se re-entrena solo todos los lunes (`vercel.json`).

Tests del modelo: `npm run test:yield-model`.

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