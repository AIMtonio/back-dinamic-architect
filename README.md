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

Base URL local: http://localhost:3000

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

- Ruta default: src/data/input/Componentes.xlsx
- Puede sobrescribirse con variable de entorno EXCEL_FILE_PATH
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

## Estado actual de pruebas

- Hay pruebas base de definicion para controladores/servicios.
- Hay e2e basico del endpoint raiz.
- No hay cobertura funcional de generacion XML/drawio, validaciones ni errores de negocio.

## Observaciones tecnicas encontradas

- DTOs y entidades estan como placeholders sin validacion.
- Errores de entrada se lanzan con Error generico en servicios (sin HttpException).
- En Archimate existe parsing de relaciones, pero hoy no se integran relaciones al XML final de salida.
- En diagrams el endpoint GET /diagram/hola parece ser util de prueba y no funcional de negocio.
- Hay archivo SQL en src/diagrams que no forma parte del flujo de NestJS.

## Sugerencias de posibles features

1. Agregar validaciones con class-validator/class-transformer para todos los payloads.
2. Estandarizar manejo de errores con HttpException y codigos HTTP claros.
3. Versionar API (por ejemplo /v1/archimate y /v1/diagram).
4. Exponer descarga directa de archivos generados (stream o URL temporal).
5. Guardar metadata de ejecuciones (fecha, input hash, path de salida, usuario).
6. Soportar relaciones ArchiMate en el XML de salida y conexiones en la vista.
7. Agregar pruebas unitarias y e2e para casos felices y errores.
8. Mover configuracion a .env documentado (puerto, rutas input/output).
9. Separar servicios de parsing, transformacion y render XML para mejorar mantenibilidad.
10. Añadir endpoint de validacion previa (dry-run) sin escribir archivo.

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
