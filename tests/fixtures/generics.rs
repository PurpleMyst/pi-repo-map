pub fn process<T: Clone>(items: Vec<T>) -> Vec<T> {
    items
}

struct Config<T = i32> {
    value: T,
}

pub enum Result<T, E> {
    Ok(T),
    Err(E),
}