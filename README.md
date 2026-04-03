# Dynamic Architect API

Backend en NestJS para generar artefactos de arquitectura a partir de datos estructurados.

Incluye dos dominios principales:

1. Generacion de modelos ArchiMate en XML.
2. Generacion de diagramas draw.io en formato XML.

## Objetivo del proyecto

Exponer endpoints HTTP que reciban datos en Excel o JSON y produzcan archivos listos para importar/visualizar en herramientas de arquitectura.

## Stack tecnico

- Node.js + NestJS 10
- TypeScript
- xlsx para lectura de Excel
- fs para escritura de archivos
- Jest para pruebas unitarias y e2e base

## Configuracion por entorno (.env)

La API toma su configuracion de variables de entorno.

1. Copia [ .env.example ](.env.example) a `.env`.
2. Ajusta rutas/puerto segun tu entorno local.

Variables disponibles:

- `PORT`: puerto HTTP de NestJS.
- `ARCHIMATE_INPUT_EXCEL_PATH`: ruta de entrada Excel para Archimate.
- `ARCHIMATE_OUTPUT_DIR`: carpeta base de salida Archimate.
- `ARCHIMATE_DEFAULT_OUTPUT_FILE`: nombre default de XML Archimate.
- `DIAGRAM_INPUT_EXCEL_PATH`: ruta de entrada Excel para Diagram.
- `DIAGRAM_OUTPUT_DIR`: carpeta base de salida Diagram.
- `DIAGRAM_OUTPUT_EXCEL_FILE`: nombre default de salida draw.io desde Excel.
- `DIAGRAM_OUTPUT_JSON_FILE`: nombre default de salida draw.io desde JSON.
- `GOOGLE_DRIVE_UPLOAD_ON_FINISH`: si es `true`, sube automaticamente el archivo Archimate generado.
- `GOOGLE_DRIVE_FOLDER_ID`: id de carpeta destino en Google Drive.
- `GOOGLE_DRIVE_CLIENT_EMAIL`: correo de service account de Google.
- `GOOGLE_DRIVE_PRIVATE_KEY`: private key del service account (usar `\\n` en una sola linea).
- `GOOGLE_DRIVE_PUBLIC_READ`: si es `true`, publica permiso de lectura para cualquier persona con enlace.
- `GOOGLE_OAUTH_CLIENT_ID`: client id OAuth2 de Google (usuario).
- `GOOGLE_OAUTH_CLIENT_SECRET`: client secret OAuth2 de Google (usuario).
- `GOOGLE_OAUTH_REDIRECT_URI`: redirect URI registrada en Google Cloud.
- `GOOGLE_OAUTH_REFRESH_TOKEN`: refresh token del usuario para subir a Google Drive personal.

Compatibilidad:

- `EXCEL_FILE_PATH` se mantiene como fallback para Diagram si no se define `DIAGRAM_INPUT_EXCEL_PATH`.

## Estructura general

```text
.
├── src
│   ├── app.*
│   ├── archimate
│   │   ├── archimate.controller.ts
│   │   ├── archimate.service.ts
│   │   ├── dto
│   │   └── entities
│   ├── diagrams
│   │   ├── diagrams.controller.ts
│   │   ├── diagrams.service.ts
│   │   ├── dto
│   │   └── entities
│   ├── data
│   │   ├── input
│   │   └── output
│   └── img
├── test
└── README.md
```

## Flujo de ejecucion

1. La API recibe peticiones HTTP.
2. El servicio correspondiente transforma la entrada (Excel o JSON) a estructuras internas.
3. Se arma un XML en memoria.
4. El XML se guarda en src/data/output.
5. Se retorna JSON con mensaje y ruta del archivo generado.

## Modulos y responsabilidades

### Modulo App

- Endpoint de salud basico.
- Respuesta actual: Hello World!

### Modulo Archimate

Responsable de construir un modelo ArchiMate 3.x con:

- Elementos: CourseOfAction, BusinessActor, Principle, Goal, Driver.
- Organizaciones por capa (Strategy, Business, Motivation, Views).
- Vista de diagrama con contenedores y nodos estilizados.

Notas relevantes:

- Soporta aliases en espanol/ingles para nombres de hojas y columnas.
- Normaliza tildes, espacios, guiones y mayusculas en matching de claves.
- Si faltan datos, agrega elementos default para mantener un XML valido.

### Modulo Diagrams

Responsable de construir archivos draw.io (mxGraphModel) con componentes en grilla.

- Tipos especiales soportados: lambda y eks.
- Tipo desconocido: fallback a rectangulo.
- Salida en archivos .drawio dentro de src/data/output.

## Endpoints y consumos

Base URL local: `http://localhost:${PORT}` (por default 3000)

### 1) GET /

Descripcion: salud basica.

Ejemplo:

```bash
curl -X GET http://localhost:3000/
```

Respuesta esperada:

```text
Hello World!
```

### 2) GET /archimate/from-excel

Descripcion: genera archivo ArchiMate desde Excel.

Query params:

- file (opcional): ruta del archivo Excel.
- out (opcional): nombre o ruta de salida del XML.

Defaults:

- file = src/data/input/business_actors.xlsx
- out = archimate-model.xml

Ejemplo:

```bash
curl -G "http://localhost:3000/archimate/from-excel" \
   --data-urlencode "file=src/data/input/business_actors.xlsx" \
   --data-urlencode "out=archimate-model.xml"
```

Respuesta tipica:

```json
{
   "message": "Reporte ArchiMate generado",
   "file": "src/data/output/archimate-model.xml"
}
```

### 3) POST /archimate/from-json

Descripcion: genera archivo ArchiMate desde JSON enviado en el body.

Body JSON:

- out (opcional): nombre/ruta de salida.
- businessActors o aliases.
- drivers o aliases.
- goals o aliases.
- principles o aliases.
- courseOfActions o aliases.

Ejemplo:

```bash
curl -X POST http://localhost:3000/archimate/from-json \
   -H "Content-Type: application/json" \
   -d '{
      "out": "archimate-model.json-input.xml",
      "businessActors": [
         { "id": "ba1", "name": "Gerencia" },
         { "name": "Operaciones" }
      ],
      "drivers": ["Cumplimiento regulatorio"],
      "goals": [{ "name": "Mejorar eficiencia" }],
      "principles": [{ "name": "Automatizacion primero" }],
      "courseOfActions": [{ "name": "Implementar BPM" }]
   }'
```

Respuesta tipica:

```json
{
   "message": "Reporte ArchiMate generado",
   "file": "src/data/output/archimate-model.json-input.xml"
}
```

### 3.1) GET /archimate/from-excel/dry-run

Descripcion: valida lectura y parseo de Excel para Archimate sin generar archivo.

Ejemplo:

```bash
curl -G "http://localhost:3000/archimate/from-excel/dry-run" \
   --data-urlencode "file=src/data/input/business_actors.xlsx" \
   --data-urlencode "out=archimate-model.xml"
```

### 3.2) POST /archimate/from-json/dry-run

Descripcion: valida payload JSON de Archimate sin escribir XML.

Ejemplo:

```bash
curl -X POST http://localhost:3000/archimate/from-json/dry-run \
   -H "Content-Type: application/json" \
   -d '{
      "businessActors": [{ "name": "Gerencia" }],
      "drivers": ["Cumplimiento regulatorio"]
   }'
```

### 4) POST /diagram/from-json

Descripcion: genera draw.io desde payload JSON.

Esquemas soportados:

1. Nuevo esquema

```json
{
   "componentes": ["API", "DB", "Frontend"],
   "tipo": ["lambda", "eks", "lambda"]
}
```

2. Esquema flexible (arrays de objetos)

```json
{
   "items": [
      { "name": "Servicio A", "type": "lambda" },
      { "nombre": "Servicio B", "tipo": "eks" }
   ]
}
```

Ejemplo:

```bash
curl -X POST http://localhost:3000/diagram/from-json \
   -H "Content-Type: application/json" \
   -d '{
      "componentes": ["API", "DB", "Frontend"],
      "tipo": ["lambda", "eks", "lambda"]
   }'
```

Respuesta tipica:

```json
{
   "message": "Diagrama generado: src/data/output/diagramaComponentesJson.drawio",
   "file": "src/data/output/diagramaComponentesJson.drawio",
   "componentsCount": 3
}
```

### 5) GET /diagram/from-excel

Descripcion: genera draw.io desde Excel.

Reglas actuales:

- Ruta default: `DIAGRAM_INPUT_EXCEL_PATH`
- Puede usar fallback `EXCEL_FILE_PATH`
- Debe existir y tener extension .xlsx
- Debe incluir cabeceras name y type

Ejemplo:

```bash
curl -X GET http://localhost:3000/diagram/from-excel
```

Respuesta tipica:

```json
{
   "message": "diagram.drawio generado desde Excel!",
   "file": "src/data/output/diagramaComponentes.drawio"
}
```

### 5.1) GET /diagram/from-excel/dry-run

Descripcion: valida el archivo Excel de componentes sin generar draw.io.

Ejemplo:

```bash
curl -X GET http://localhost:3000/diagram/from-excel/dry-run
```

### 4.1) POST /diagram/from-json/dry-run

Descripcion: valida payload JSON para draw.io sin escribir archivo.

Ejemplo:

```bash
curl -X POST http://localhost:3000/diagram/from-json/dry-run \
   -H "Content-Type: application/json" \
   -d '{
      "componentes": ["API", "DB"],
      "tipo": ["lambda", "eks"]
   }'
```

### 6) GET /diagram/hola

Descripcion: endpoint de prueba/manual.

Respuesta:

```text
Hola desde el controlador de diagramas!!!
```

## Archivos de entrada y salida

Entradas actuales:

- src/data/input/business_actors.xlsx
- src/data/input/Componentes.xlsx
- src/data/input/prueba.archimate

Salidas generadas:

- src/data/output/archimate-model.xml
- src/data/output/diagramaComponentes.drawio
- src/data/output/diagramaComponentesJson.drawio

## Scripts

```bash
bun i
bun run start:dev
bun run build
bun run test
bun run test:e2e
```

## Ejemplo rapido de .env

```dotenv
PORT=3000
ARCHIMATE_INPUT_EXCEL_PATH=src/data/input/business_actors.xlsx
ARCHIMATE_OUTPUT_DIR=src/data/output
ARCHIMATE_DEFAULT_OUTPUT_FILE=archimate-model.xml
DIAGRAM_INPUT_EXCEL_PATH=src/data/input/Componentes.xlsx
DIAGRAM_OUTPUT_DIR=src/data/output
DIAGRAM_OUTPUT_EXCEL_FILE=diagramaComponentes.drawio
DIAGRAM_OUTPUT_JSON_FILE=diagramaComponentesJson.drawio
GOOGLE_DRIVE_UPLOAD_ON_FINISH=false
GOOGLE_DRIVE_FOLDER_ID=
GOOGLE_DRIVE_CLIENT_EMAIL=
GOOGLE_DRIVE_PRIVATE_KEY=
GOOGLE_DRIVE_PUBLIC_READ=true
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/archimate/google-drive/exchange-code
GOOGLE_OAUTH_REFRESH_TOKEN=
```

## Configuracion Google Drive con cuenta personal (OAuth2)

Si no tienes Unidades compartidas (Shared Drives), usa OAuth2 de usuario.

1. En Google Cloud Console, habilita Google Drive API.
2. Crea credenciales OAuth Client ID (tipo Web application).
3. En Authorized redirect URIs agrega:
   - `http://localhost:3000/archimate/google-drive/exchange-code`
4. Configura en `.env`:
   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET`
   - `GOOGLE_OAUTH_REDIRECT_URI`
   - `GOOGLE_DRIVE_FOLDER_ID`
   - `GOOGLE_DRIVE_UPLOAD_ON_FINISH=true`
5. Inicia API y abre:
   - `GET /archimate/google-drive/auth-url`
6. Autoriza en Google y copia el `code` que llega al redirect.
7. El endpoint `GET /archimate/google-drive/exchange-code?code=...` devuelve `refreshToken`.
8. Guarda ese valor en `GOOGLE_OAUTH_REFRESH_TOKEN`.

Con eso, las generaciones de Archimate subiran automatico a Drive personal.

### Error invalid_grant

Si la API responde `El reporte se genero, pero fallo la subida a Google Drive: invalid_grant`, el problema no esta en la generacion del archivo sino en el refresh token OAuth2.

Las causas mas comunes son:

1. `GOOGLE_OAUTH_REFRESH_TOKEN` fue revocado o expirado.
2. El refresh token fue emitido para otro `GOOGLE_OAUTH_CLIENT_ID` o con otro `GOOGLE_OAUTH_CLIENT_SECRET`.
3. Se regeneraron las credenciales OAuth en Google Cloud y el token viejo quedo invalido.
4. La app nunca recibio realmente un refresh token y se guardo un valor incorrecto o vacio.

Pasos de correccion:

1. Verifica que `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` y `GOOGLE_OAUTH_REDIRECT_URI` coincidan exactamente con el cliente OAuth que genero el token.
2. Genera un URL nuevo en alguno de estos endpoints:
   - `GET /archimate/google-drive/auth-url`
   - `GET /diagram/google-drive/auth-url`
   - `GET /initial-document/google-drive/auth-url`
3. Autoriza de nuevo y usa el `code` recibido en el redirect sobre el endpoint equivalente `.../google-drive/exchange-code`.
4. Guarda el nuevo `refreshToken` en `GOOGLE_OAUTH_REFRESH_TOKEN` y reinicia la API.

Si tambien tienes configurado `GOOGLE_DRIVE_CLIENT_EMAIL` y `GOOGLE_DRIVE_PRIVATE_KEY`, la API ahora intentara usar Service Account automaticamente cuando OAuth falle con `invalid_grant`.

## Estado actual de pruebas

- Hay pruebas base de definicion para controladores/servicios.
- Hay e2e basico del endpoint raiz.
- No hay cobertura funcional de generacion XML/drawio ni de casos de error de negocio.

## Observaciones tecnicas encontradas

- Ya hay validaciones de payload con class-validator/class-transformer en endpoints JSON.
- Ya se estandarizo el manejo de errores con HttpException y codigos HTTP claros.
- Ya existen endpoints dry-run para validacion previa sin escritura de archivos.
- La configuracion principal ya se movio a variables de entorno documentadas en .env/.env.example.
- En Archimate existe parsing de relaciones, pero hoy no se integran relaciones al XML final de salida.
- En diagrams el endpoint GET /diagram/hola parece ser util de prueba y no funcional de negocio.
- Hay archivo SQL en src/diagrams que no forma parte del flujo de NestJS.

## Sugerencias de posibles features

1. Resuelta: Agregar validaciones con class-validator/class-transformer para payloads JSON.
2. Resuelta: Estandarizar manejo de errores con HttpException y codigos HTTP claros.
3. Pendiente: Versionar API (por ejemplo /v1/archimate y /v1/diagram).
4. Pendiente: Exponer descarga directa de archivos generados (stream o URL temporal).
5. Pendiente: Guardar metadata de ejecuciones (fecha, input hash, path de salida, usuario).
6. Pendiente: Soportar relaciones ArchiMate en el XML de salida y conexiones en la vista.
7. Pendiente: Agregar pruebas unitarias y e2e para casos felices y errores.
8. Resuelta: Mover configuracion a .env documentado (puerto, rutas input/output).
9. Parcial: Separar servicios de parsing, transformacion y render XML para mejorar mantenibilidad.
10. Resuelta: Añadir endpoint de validacion previa (dry-run) sin escribir archivo.

## Roadmap recomendado

Fase 1: calidad y robustez

- Validaciones de entrada
- Manejo de errores uniforme
- Pruebas de regresion

Fase 2: capacidades funcionales

- Relaciones ArchiMate completas
- Multiples vistas por diagrama
- Plantillas de estilo configurables

Fase 3: operacion

- Observabilidad (logs estructurados)
- Seguridad basica (auth o API key)
- Persistencia de resultados/historial

## Notas de mantenimiento

- El endpoint GET /archimate/from-excel se mantiene operativo para compatibilidad.
- El endpoint POST /archimate/from-json recibe el JSON directamente en body.
- Si out no trae ruta completa, se guarda automaticamente en src/data/output.
