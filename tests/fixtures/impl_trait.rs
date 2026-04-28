pub trait Display {
    fn format(&self) -> String;
}

pub impl Display for User {
    fn format(&self) -> String {
        self.name.clone()
    }
}

impl<T> Printable for T where T: Display {
    fn print(&self) {
        println!("{}", self.format());
    }
}