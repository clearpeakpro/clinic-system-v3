# Datos de la API

## `common-passwords.txt`

Lista local de contraseñas comunes que la política de contraseñas rechaza (ADR 0023). La API la carga al arrancar y la consulta en memoria, sin servicios externos.

- **Origen:** [SecLists](https://github.com/danielmiessler/SecLists) (licencia MIT, © 2018 Daniel Miessler). Se combinan dos listas de `Passwords/Common-Credentials/`:
  - `100k-most-used-passwords-NCSC.txt`;
  - `xato-net-10-million-passwords-1000000.txt`.
- **Filtrado:** solo entradas de 12 a 128 caracteres imprimibles, porque las de menos de 12 ya las rechaza la longitud mínima. Se pasan a minúsculas, se quitan los duplicados y se ordenan: **46,825 entradas**.
- **Comparación:** sin distinguir mayúsculas de minúsculas.
- **Para regenerarla:** descargar las dos listas y aplicar el mismo filtro. El PR de T-003b documenta el procedimiento.
