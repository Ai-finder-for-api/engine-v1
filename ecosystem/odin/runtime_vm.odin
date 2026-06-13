package runtime_vm

import "core:fmt"

OpCode :: enum u8 {
    Halt,
    PushI32,
    AddI32,
    MulI32,
    Store,
    Load,
}

VM :: struct {
    stack: [dynamic]i32,
    registers: [16]i32,
}

vm_init :: proc(vm: ^VM) {
    vm.stack = make([dynamic]i32, 0, 64)
}

vm_run :: proc(vm: ^VM, bytecode: []u8) {
    pc: int = 0
    for pc < len(bytecode) {
        op := OpCode(bytecode[pc])
        pc += 1
        switch op {
        case .Halt:
            return
        case .PushI32:
            value := i32(bytecode[pc]) |
                (i32(bytecode[pc + 1]) << 8) |
                (i32(bytecode[pc + 2]) << 16) |
                (i32(bytecode[pc + 3]) << 24)
            append(&vm.stack, value)
            pc += 4
        case .AddI32:
            b := vm.stack[len(vm.stack) - 1]
            a := vm.stack[len(vm.stack) - 2]
            vm.stack = vm.stack[:len(vm.stack) - 2]
            append(&vm.stack, a + b)
        case .MulI32:
            b := vm.stack[len(vm.stack) - 1]
            a := vm.stack[len(vm.stack) - 2]
            vm.stack = vm.stack[:len(vm.stack) - 2]
            append(&vm.stack, a * b)
        case .Store:
            reg := int(bytecode[pc])
            pc += 1
            vm.registers[reg] = vm.stack[len(vm.stack) - 1]
            vm.stack = vm.stack[:len(vm.stack) - 1]
        case .Load:
            reg := int(bytecode[pc])
            pc += 1
            append(&vm.stack, vm.registers[reg])
        }
    }
}

debug_dump :: proc(vm: ^VM) {
    fmt.println("stack:", vm.stack)
    fmt.println("registers:", vm.registers)
}
