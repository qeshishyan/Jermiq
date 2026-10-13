FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY global.json ./
COPY src/Jermiq.Web/Jermiq.Web.csproj src/Jermiq.Web/
RUN dotnet restore src/Jermiq.Web/Jermiq.Web.csproj
COPY src/ src/
RUN dotnet publish src/Jermiq.Web/Jermiq.Web.csproj -c Release --no-restore -o /out

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
RUN mkdir -p /data && chown app:app /data
COPY --from=build --chown=app:app /out/ ./
ENV ASPNETCORE_HTTP_PORTS=8080 \
    Persistence__DataDirectory=/data
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "Jermiq.Web.dll"]
