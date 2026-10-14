class Program {
    static int Main(string []args) {
        if (args.Length > 0)
        {
            string name = args[0];
            Console.WriteLine($"Guten Tag {name}");
            return 0;
        }

        Console.WriteLine("No Arguments were passed");
        return 1;
    }
}
