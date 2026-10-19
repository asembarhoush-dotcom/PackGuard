var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/", () => "PackGuard is live and running on Cloud Run!");

app.Run();
