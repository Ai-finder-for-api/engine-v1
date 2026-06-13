use crossbeam_channel::{unbounded, Receiver, Sender};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AssetTask {
    pub id: u64,
    pub source_path: PathBuf,
    pub target_path: PathBuf,
    pub kind: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AssetResult {
    pub id: u64,
    pub bytes: usize,
    pub checksum: u64,
}

pub struct AssetPipeline {
    sender: Sender<AssetTask>,
    receiver: Receiver<AssetResult>,
}

fn fnv1a64(data: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in data {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn transform_asset(kind: &str, bytes: &[u8]) -> Vec<u8> {
    match kind {
        "shader" => bytes.iter().map(|b| b ^ 0xAA).collect(),
        "mesh" => bytes.iter().rev().copied().collect(),
        _ => bytes.to_vec(),
    }
}

fn process_task(task: AssetTask) -> AssetResult {
    let source = fs::read(&task.source_path).unwrap_or_default();
    let transformed = transform_asset(&task.kind, &source);
    let _ = fs::write(&task.target_path, &transformed);
    AssetResult {
        id: task.id,
        bytes: transformed.len(),
        checksum: fnv1a64(&transformed),
    }
}

impl AssetPipeline {
    pub fn new(worker_threads: usize) -> Self {
        let (task_tx, task_rx) = unbounded::<AssetTask>();
        let (result_tx, result_rx) = unbounded::<AssetResult>();

        for _ in 0..worker_threads {
            let task_rx = task_rx.clone();
            let result_tx = result_tx.clone();
            thread::spawn(move || {
                while let Ok(task) = task_rx.recv() {
                    let result = process_task(task);
                    let _ = result_tx.send(result);
                }
            });
        }

        Self {
            sender: task_tx,
            receiver: result_rx,
        }
    }

    pub fn enqueue(&self, task: AssetTask) {
        let _ = self.sender.send(task);
    }

    pub fn recv(&self) -> Option<AssetResult> {
        self.receiver.recv().ok()
    }

    pub fn build_manifest<P: AsRef<Path>>(assets: &[AssetTask], out_path: P) {
        let results: Vec<AssetResult> = assets
            .par_iter()
            .cloned()
            .map(process_task)
            .collect();
        let manifest = serde_json::to_vec_pretty(&results).unwrap();
        let _ = fs::write(out_path, manifest);
    }
}
