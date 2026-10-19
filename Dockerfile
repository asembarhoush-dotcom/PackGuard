ARG DOTNET_TAG=11.0-preview

FROM mcr.microsoft.com/dotnet/sdk:${DOTNET_TAG} AS build
WORKDIR /src
COPY PackGuard.csproj ./
RUN dotnet restore
COPY . .
RUN dotnet publish PackGuard.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/runtime:${DOTNET_TAG} AS final
WORKDIR /app
COPY --from=build /app/publish .
USER $APP_UID
ENTRYPOINT ["dotnet", "PackGuard.dll"]
