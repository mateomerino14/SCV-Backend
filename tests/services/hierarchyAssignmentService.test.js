const usuarios = [
  {id_usuario: 1, activo: true, numero_seccion: 'Ventas', id_jefe_directo: null, id_rol: 4}, // Lucia, REVISOR
  {id_usuario: 2, activo: true, numero_seccion: null, id_jefe_directo: 1, id_rol: 5}, // Pedro, APROBADOR, jefe=Lucia
  {id_usuario: 3, activo: true, numero_seccion: 'Ventas', id_jefe_directo: 2, id_rol: 2}, // Maria, SUPERVISOR, jefe=Pedro
  {id_usuario: 4, activo: true, numero_seccion: 'Logistica', id_jefe_directo: 2, id_rol: 2}, // Jorge, SUPERVISOR, jefe=Pedro
  {id_usuario: 5, activo: true, numero_seccion: 'Ventas', id_jefe_directo: 3, id_rol: 3}, // Juan, EMPLEADO, jefe=Maria
  {id_usuario: 6, activo: true, numero_seccion: 'Sin Cobertura', id_jefe_directo: null, id_rol: 3}, // Sofia, EMPLEADO, sin jefe
  {id_usuario: 7, activo: true, numero_seccion: 'Ventas', id_jefe_directo: null, id_rol: 3}, // Diego, EMPLEADO, sin jefe, seccion Ventas
]
const roles = {2: 'SUPERVISOR', 3: 'EMPLEADO', 4: 'REVISOR', 5: 'APROBADOR'}

jest.mock('../../src/config/supabase', () => ({
  from: (table) => {
    const state = {eq: {}, neq: {}}
    const builder = {
      select: () => builder,
      eq: (col, val) => { state.eq[col] = val; return builder },
      neq: (col, val) => { state.neq[col] = val; return builder },
      single: () => builder,
      then: (resolve) => {
        if (table !== 'Usuario') {
          return resolve({data: null, error: null})
        }
        // Consulta por id_usuario (jefe directo o persona base)
        if (state.eq.id_usuario !== undefined) {
          const user = usuarios.find((entry) => entry.id_usuario === state.eq.id_usuario)
          if (!user) {
            return resolve({data: null, error: null})
          }
          return resolve({data: {...user, Rol: {nombre: roles[user.id_rol]}}, error: null})
        }
        // Consulta por seccion + rol + activo (nivel 2, respaldo por seccion)
        const matches = usuarios.filter((entry) =>
          entry.activo === state.eq.activo &&
          entry.numero_seccion === state.eq.numero_seccion &&
          roles[entry.id_rol] === state.eq['Rol.nombre'] &&
          entry.id_usuario !== state.neq.id_usuario
        )
        return resolve({data: matches, error: null})
      },
    }
    return builder
  },
}))

const {resolveReviewerScope} = require('../../src/services/shared/hierarchyAssignmentService')

test('empleado con jefe directo del rol correcto resuelve directo a esa persona', async () => {
  const scope = await resolveReviewerScope(5, 'SUPERVISOR') // Juan -> Maria
  expect(scope.level).toBe('directo')
  expect(scope.userIds).toEqual([3])
})

test('supervisor con jefe directo aprobador resuelve directo al aprobador', async () => {
  const scope = await resolveReviewerScope(3, 'APROBADOR') // Maria -> Pedro
  expect(scope.level).toBe('directo')
  expect(scope.userIds).toEqual([2])
})

test('sin jefe directo y sin nadie en su seccion cae al respaldo de todos', async () => {
  const scope = await resolveReviewerScope(6, 'SUPERVISOR') // Sofia, seccion sin supervisores
  expect(scope.level).toBe('todos')
  expect(scope.userIds).toBe(null)
})

test('sin jefe directo pero con alguien de su seccion cae al respaldo por seccion', async () => {
  const scope = await resolveReviewerScope(7, 'SUPERVISOR') // Diego, seccion Ventas -> Maria
  expect(scope.level).toBe('seccion')
  expect(scope.userIds).toEqual([3])
})

test('el respaldo por seccion nunca incluye a la propia persona como su destinatario', async () => {
  // Maria es SUPERVISOR de la seccion Ventas; su jefe Pedro es APROBADOR, no sirve para este rol.
  // Sin la exclusion, el nivel 2 la devolveria a ella misma como "supervisora de Ventas".
  const scope = await resolveReviewerScope(3, 'SUPERVISOR')
  expect(scope.userIds || []).not.toContain(3)
})
