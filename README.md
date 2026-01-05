# 📘 Generador de XML ArchiMate con NestJS

Este proyecto permite **leer un archivo Excel** y generar dinámicamente nodos `<element xsi:type="Principle">` dentro de un modelo ArchiMate 3.0 en formato XML.  
Está construido con **NestJS**, utilizando la librería `xlsx` para procesar Excel y `uuid` para generar identificadores únicos.

---

## 🚀 Características
- Lectura de un archivo Excel (`.xlsx`).
- Selección de una **hoja específica** mediante query param.
- Generación automática de nodos `<Principle>` en el bloque `<elements>` del XML.
- Servido como endpoint HTTP en NestJS.

---

## 📦 Instalación

1. Clona el repositorio:
   ```bash
   git clone https://github.com/tu-repo/archimate-xml-generator.git
   cd archimate-xml-generator