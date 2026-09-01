FROM golang:1.26.5@sha256:705e964a93a2fd2e75c7d59bb7d781b57e30f12293ffde5175c69229e18fb678

WORKDIR /go/src/app
COPY . .

RUN echo $(pwd)

CMD ["go", "run", "."]
