const std = @import("std");

pub const OpCode = enum(u8) {
    halt,
    push_i32,
    add_i32,
    mul_i32,
    store,
    load,
};

pub const VM = struct {
    allocator: std.mem.Allocator,
    stack: std.ArrayList(i32),
    registers: [16]i32,

    pub fn init(allocator: std.mem.Allocator) VM {
        return VM{
            .allocator = allocator,
            .stack = std.ArrayList(i32).init(allocator),
            .registers = [_]i32{0} ** 16,
        };
    }

    pub fn deinit(self: *VM) void {
        self.stack.deinit();
    }

    pub fn run(self: *VM, bytecode: []const u8) !void {
        var pc: usize = 0;
        while (pc < bytecode.len) {
            const op: OpCode = @enumFromInt(bytecode[pc]);
            pc += 1;
            switch (op) {
                .halt => return,
                .push_i32 => {
                    const value = std.mem.readInt(i32, bytecode[pc .. pc + 4], .little);
                    pc += 4;
                    try self.stack.append(value);
                },
                .add_i32 => {
                    const rhs = self.stack.pop();
                    const lhs = self.stack.pop();
                    try self.stack.append(lhs + rhs);
                },
                .mul_i32 => {
                    const rhs = self.stack.pop();
                    const lhs = self.stack.pop();
                    try self.stack.append(lhs * rhs);
                },
                .store => {
                    const reg = bytecode[pc];
                    pc += 1;
                    self.registers[reg] = self.stack.pop();
                },
                .load => {
                    const reg = bytecode[pc];
                    pc += 1;
                    try self.stack.append(self.registers[reg]);
                },
            }
        }
    }
};
