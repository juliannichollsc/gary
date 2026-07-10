


// GARY — spawn de procesos hijo sin ventana de consola.
//
// GARY es una app GUI: no tiene consola propia, así que Windows le asigna una VENTANA de consola NUEVA a
// cada hijo de subsistema-consola que lanzamos (`node`, `cmd /C …`). Salen en blanco (su stdout va a un
// pipe) y, peor, si el usuario cierra una de esas ventanas el hijo recibe Ctrl+C y muere con 0xC000013A
// (STATUS_CONTROL_C_EXIT) — así se caían la ingesta de NotebookLM y "Verificar conexiones".
//
// `CREATE_NO_WINDOW` elimina la ventana: no hay nada que cerrar ni Ctrl+C que recibir. La bandera NO se
// hereda, así que los nietos gráficos (Chrome) siguen viéndose con normalidad.
//
// En sistemas no-Windows es un no-op.
use std::process::Command;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn hide_console(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}
