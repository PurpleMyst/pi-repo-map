use std::collections::HashMap;
use std::path::Path;
use std::{fs, path::PathBuf};

use anyhow::{Result, anyhow, bail};
use gix::objs::{Blob, Object, Tree, WriteTo, compute_hash, tree::EntryKind};
use walkdir::WalkDir;

#[derive(Debug)]
pub struct RootedTree {
    pub root: PathBuf,
    pub tree_oid: gix::hash::ObjectId,
    pub objects: HashMap<gix::hash::ObjectId, Object>,
}

impl RootedTree {
    pub fn capture(
        root: PathBuf,
        normalize_content: impl Fn(&Path, Vec<u8>) -> Result<Vec<u8>>,
        should_include: impl Fn(&Path) -> bool,
    ) -> Result<Self> {
        let wd = WalkDir::new(&root).contents_first(true).sort_by_file_name();
        Ok(Self { root, tree_oid: todo!(), objects: todo!() })
    }
}
