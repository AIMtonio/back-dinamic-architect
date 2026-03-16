-- Author:  RodrigoHu
-- Create date: 09-02-2026
-- Description: Se hace la migración del sp para dispositivos autoenrolables
-- =============================================

CREATE   PROCEDURE [dbo].[usp_SFC_AgregarAmortización]
@ClaveSolicitud varchar(20)
, @MontoAbono     float
, @EsParcial      int = 0
, @FechaPago     date = NULL
AS
BEGIN TRY
    SET NOCOUNT ON;
    SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
    SET LANGUAGE SPANISH;

    DECLARE @Usuario                 varchar(16) = 'JOBSQL'
    DECLARE @PrimerPagoPendiente        int   = 0
    DECLARE @SemanasPagadas              int   = 0
    DECLARE @NuevoVencimiento            date
    DECLARE @VencimientoAplicar          date
    DECLARE @CapitalPagado               float = 0.0
    DECLARE @InteresPagado               float = 0.0
    DECLARE @SaldoAbono                  float = 0.0
    DECLARE @PagoRestante                float = 0.0
    DECLARE @CapitalAplicar              float = 0
    DECLARE @InteresAplicar              float = 0
    DECLARE @PagoAplicar                 float = 0
    DECLARE @PorcentajeCapital           float = 0.0
    DECLARE @FechaModificacion           datetime
    DECLARE @FechaModificacionBase      datetime
    DECLARE @AccionBase                  varchar(20)
    DECLARE @EstadoDispositivoBase      varchar(20)
    DECLARE @FechaPagoAplicar           date = NULL
    DECLARE @ToleranciaCentavos          float = 0.50
    DECLARE @Mensaje                      varchar(512)
    DECLARE @Estatus                      bit
    DECLARE @PagosTabla                  int
    DECLARE @PagosCredito                int
    DECLARE @PagoSemanal                 float
    DECLARE @SaldoTotalCredito          float
    DECLARE @FechaVigencia               date
    DECLARE @FechaAmortizacionPendiente date
    DECLARE @GarantiaAplicar          FLOAT = 0
    DECLARE @MembresiaAplicar         FLOAT = 0
    DECLARE @SaldoGarantia        FLOAT = 0
    DECLARE @SaldoMembresia           FLOAT = 0
    DECLARE @MontoGarantia        FLOAT = 0
    DECLARE @MontoMembresia           FLOAT = 0
    DECLARE @PagoTotalAplicado     FLOAT
    DECLARE @MembresiaPagado          FLOAT = 0
    DECLARE @GarantiaPagado           FLOAT = 0
    DECLARE @CveSolicitudAval         varchar(20) = 'HOLANOSOYSL'
    DECLARE @TieneAvalMpf         int = 0
    DECLARE @TieneAvalPf          int = 0
    DECLARE @ImeiAval            varchar(50)
    DECLARE @FgPf               int
    DECLARE @AccionActivar     int = 0

    IF @FechaPago IS NULL
        SET @FechaPago = CONVERT(DATE, GETDATE())

    IF ISNULL(@ClaveSolicitud, '') = '' or ISNULL(@MontoAbono, 0) = 0
        BEGIN
            SET @mensaje = 'Se especificó una opción o parámetro no válido para el procedimiento ''usp_SFC_AgregarAmortización''';
            THROW 51000, @mensaje, 1;
        END

    select @estatus = VsStatus
         , @PagosCredito  = VsPlazo
         , @PagoSemanal   = VsPagoSemanal
         , @FechaVigencia = ISNULL(VsFechaVigencia, DATEADD(DAY, 7, VsFechaVenta))
         , @ImeiAval = VsImeiDispositivo
         , @FgPf = FgProductosFinancieros
    from dbo.SOF_SfcVentasSoftcredito WITH (NOLOCK)
    where ClaveSolicitud = @ClaveSolicitud

    IF @estatus = 0
        BEGIN
            SET @mensaje = CONCAT('La solicitud ',@ClaveSolicitud,' se encuentra CANCELADA');
            THROW 51001, @mensaje, 1;
        END

    select @PrimerPagoPendiente        = min(case when round(TaPagoRestante-@ToleranciaCentavos, 2) >= 0.0 then TaNumeroPago end)
         , @PagosTabla                  = max(TaNumeroPago)
         , @SaldoTotalCredito          = sum(TaPagoRestante)
         , @FechaAmortizacionPendiente = min(case when round(TaPagoRestante-@ToleranciaCentavos, 2) >= 0.0 then TaFechaAmortizacion end)
    from SOF_SfcTablaAmortizacion WITH (NOLOCK)
    where ClaveSolicitud = @ClaveSolicitud

    DECLARE @ErrorNumero INT = NULL;

 SET @Mensaje =
            CASE
                WHEN @@ROWCOUNT <= 0 THEN
                    CONCAT('La solicitud "',@ClaveSolicitud, '" no cuenta con amortizaciones')

                WHEN @PagosTabla <> @PagosCredito THEN
                    CONCAT(
                            'Los plazos en la tabla de amortizacion no estan completos para la solicitud "',
                            @ClaveSolicitud,
                            '".', CHAR(13), CHAR(10),
                            'Plazos credito: ', @PagosCredito, CHAR(13), CHAR(10),
                            'Número de amortización: ', @PagosTabla
                    )

                WHEN ISNULL(@PrimerPagoPendiente, 0.0) = 0.0 THEN
                    CONCAT('La solicitud "',@ClaveSolicitud,'" NO tiene pagos pendientes.')

                WHEN ISNULL(@MontoAbono, 0.0) > (ISNULL(@SaldoTotalCredito, 0.0) + @ToleranciaCentavos) THEN
                    CONCAT(
                            'El saldo de la solicitud "',@ClaveSolicitud,'" es menor al pago a realizar. ',
                            'Saldo: ', FORMAT(ROUND(ISNULL(@SaldoTotalCredito, 0), 2), 'N', 'es-MX'),
                            ' - Pago a Realizar: ',
                            FORMAT(ROUND(ISNULL(@MontoAbono, 0.0), 2), 'N', 'es-MX')
                    )

                WHEN @EsParcial = 0
                    AND (ISNULL(@MontoAbono, 0.0) + @ToleranciaCentavos) < ISNULL(@PagoSemanal, 0.0) THEN
                    CONCAT(
                            'El pago semanal de la solicitud "',@ClaveSolicitud,'" es menor que el pago a realizar. ',
                            'Pago Semanal: ', FORMAT(ROUND(ISNULL(@PagoSemanal, 0.0), 2), 'N', 'es-MX'),
                            ' - Pago a Realizar: ',
                            FORMAT(ROUND(ISNULL(@MontoAbono, 0.0), 2), 'N', 'es-MX')
                    )
                ELSE NULL
                END;

    SET @ErrorNumero =
            CASE
                WHEN @@ROWCOUNT <= 0 THEN 51000
                WHEN @PagosTabla <> @PagosCredito THEN 51000
                WHEN ISNULL(@PrimerPagoPendiente, 0.0) = 0.0 THEN 53003
                WHEN ISNULL(@MontoAbono, 0.0) > (ISNULL(@SaldoTotalCredito, 0.0) + @ToleranciaCentavos) THEN 53004
                WHEN @EsParcial = 0
                    AND (ISNULL(@MontoAbono, 0.0) + @ToleranciaCentavos) < ISNULL(@PagoSemanal, 0.0) THEN 53005
                ELSE NULL
                END;

    IF @ErrorNumero IS NOT NULL
        BEGIN
            THROW @ErrorNumero, @Mensaje, 2;
        END


    SET @SaldoAbono        = @MontoAbono
    SET @NuevoVencimiento  = @FechaAmortizacionPendiente

    WHILE ROUND(@SaldoAbono, 5) > 0
        BEGIN
            SELECT  @PagoRestante      = TaPagoRestante
                 , @PorcentajeCapital = (TaAmortizacionCapital/TaAmortizacionTotal)
                 , @FechaModificacion = FechaModificacion
                 , @MontoGarantia = TaAmortizacionGarantia
                 , @MontoMembresia = TaAmortizacionMembresia
                 , @SaldoGarantia = TaSaldoGarantia
                 , @SaldoMembresia = TaSaldoMembresia
                 , @CapitalAplicar = TaSaldoCapital
                 , @InteresAplicar = TaSaldoInteres
            FROM dbo.SOF_SfcTablaAmortizacion WITH (NOLOCK)
            WHERE ClaveSolicitud = @ClaveSolicitud
              AND TaNumeroPago = (@PrimerPagoPendiente + @SemanasPagadas)

            -- PAGO DE GARANTIA POR AMORTIZACION
            IF(@SaldoAbono > 0 AND @SaldoGarantia > 0) BEGIN
                IF(@SaldoAbono >= @SaldoGarantia) BEGIN
                    SET @GarantiaAplicar = @SaldoGarantia
                END
                ELSE BEGIN
                    SET @GarantiaAplicar = @SaldoAbono
                END
                SET @SaldoAbono = round(@SaldoAbono - @GarantiaAplicar, 5)
                SET @PagoRestante = round(@PagoRestante - @GarantiaAplicar, 5)
            END

            -- PAGO DE MEMBRESIA POR AMORTIZACION
            IF(@SaldoAbono > 0 AND @SaldoMembresia > 0) BEGIN
                IF(@SaldoAbono >= @SaldoMembresia) BEGIN
                    SET @MembresiaAplicar = @SaldoMembresia
                END
                ELSE BEGIN
                    SET @MembresiaAplicar = @SaldoAbono
                END
                SET @SaldoAbono = round(@SaldoAbono - @MembresiaAplicar, 5)
                SET @PagoRestante = round(@PagoRestante - @MembresiaAplicar, 5)
            END

            -- PAGO DE CAPITAL E INTERES POR AMORTIZACION
            IF(@SaldoAbono > 0) BEGIN
                IF (round(@SaldoAbono+@ToleranciaCentavos,5) - round(@PagoRestante, 5)) > 0
                    BEGIN
                        SET @PagoAplicar                = @PagoRestante
                        SET @FechaPagoAplicar          = @FechaPago
                        SET @VencimientoAplicar         = [dbo].[ufn_CalcularSiguienteVencimiento]
                                                          ('DIA_PAGO'
                            ,@FechaAmortizacionPendiente
                            ,@FechaVigencia
                            ,@FechaPago, 0, 7)
                        SET @FechaAmortizacionPendiente = DATEADD(DAY, 7, @FechaAmortizacionPendiente)
                        SET @NuevoVencimiento            = @VencimientoAplicar

                    END
                ELSE BEGIN -- EL PAGO ES MENOR QUE LA AMORTIZACION (Parcial o Saldos)
                    SET @PagoAplicar        = @SaldoAbono
                    SET @CapitalAplicar     = round(@PagoAplicar*@PorcentajeCapital, 5)
                    SET @InteresAplicar     = @PagoAplicar - @CapitalAplicar
                    SET @FechaPagoAplicar  = NULL
                    SET @VencimientoAplicar = NULL

                    IF @EsParcial = 1
                        BEGIN
                            -- agregamos la fecha de vencimiento a aplicar si esta vencido, conservar la actual si esta adelantada la cuenta
                            IF @FechaPago > @FechaAmortizacionPendiente
                                SET @VencimientoAplicar         = [dbo].[ufn_CalcularSiguienteVencimiento]
                                                                  ('DIA_PAGO'
                                    ,@FechaAmortizacionPendiente
                                    ,@FechaVigencia
                                    ,@FechaPago, 0, 7)
                            ELSE SET @VencimientoAplicar = @FechaAmortizacionPendiente

                            SET @NuevoVencimiento            = @VencimientoAplicar
                        END
                END
            END
            SET @PagoTotalAplicado = round(@PagoAplicar + @GarantiaAplicar + @MembresiaAplicar, 5)
            UPDATE dbo.SOF_SfcTablaAmortizacion
            SET TaPagoRestante              = round(TaPagoRestante - @PagoTotalAplicado, 5)
              , TaPagoRealizado         = round(TaPagoRealizado + @PagoTotalAplicado, 5)
              , TaPagoFecha             = @FechaPagoAplicar
              , TaPagoFechaVencimiento = @VencimientoAplicar
              , FechaModificacion     = GETDATE()
              , UsuarioModificacion   = @usuario

              , TaSaldoInteres        = TaSaldoInteres - @InteresAplicar
              , TaSaldoCapital        = TaSaldoCapital - @CapitalAplicar
              , TaSaldoMembresia       = TaSaldoMembresia - @MembresiaAplicar
              , TaSaldoGarantia        = TaSaldoGarantia - @GarantiaAplicar
            WHERE ClaveSolicitud           = @ClaveSolicitud
              and TaNumeroPago             = (@PrimerPagoPendiente + @SemanasPagadas)
              and isnull(FechaModificacion, @FechaPago) = isnull(@FechaModificacion, @FechaPago)

            IF @@ROWCOUNT <= 0
                BEGIN
                    select @FechaModificacionBase = FechaModificacion
                    from dbo.SOF_SfcTablaAmortizacion WITH (NOLOCK)
                    where ClaveSolicitud = @ClaveSolicitud
                      and TaNumeroPago = (@PrimerPagoPendiente + @SemanasPagadas)

                    IF @FechaModificacion <> @FechaModificacionBase
                        BEGIN
                            SET @mensaje = CONCAT('Error al actualizar el pago ', (@PrimerPagoPendiente + @SemanasPagadas) ,' de la solicitud ',@ClaveSolicitud, ', el registro fue modificado por otra aplicacion');
                            THROW 51000, @mensaje, 3;
                        END
                END

            SET @CapitalPagado     = @CapitalPagado + @CapitalAplicar
            SET @InteresPagado     = @InteresPagado + @InteresAplicar
            SET @MembresiaPagado    = @MembresiaPagado + @MembresiaAplicar
            SET @GarantiaPagado = @GarantiaPagado + @GarantiaAplicar
            SET @SaldoAbono    = @SaldoAbono - @PagoAplicar

            IF @FechaPagoAplicar IS NOT NULL
                SET @SemanasPagadas              = @SemanasPagadas + 1
        END

    DECLARE @Bloqueado_Saldo_Vencido BIT = 0
    select
        @FechaModificacion          = FechaModificacion
         , @AccionBase              = VsAccion
         , @EstadoDispositivoBase   = VsEstadoDispositivo
         , @Bloqueado_Saldo_Vencido  = VsBloqueoSaldoVencido
    from dbo.SOF_SfcVentasSoftcredito WITH (NOLOCK)
    where ClaveSolicitud = @ClaveSolicitud

    IF (@Bloqueado_Saldo_Vencido = 1)
        BEGIN
            DECLARE @ultima_fecha_amortizacion DATE = (select top 1 CONVERT(DATE,TaFechaAmortizacion) from dbo.SOF_SfcTablaAmortizacion WITH (NOLOCK) where ClaveSolicitud = @ClaveSolicitud and TaPagoFecha is null order by TaFechaAmortizacion asc)
            -- VALIDACION DE ULTIMO PAGO
            SET @ultima_fecha_amortizacion = ISNULL(@ultima_fecha_amortizacion, @NuevoVencimiento)

            update dbo.SOF_SfcTablaAmortizacion
            set
                TaPagoFechaVencimiento = @ultima_fecha_amortizacion
            where
                ClaveSolicitud = @ClaveSolicitud
              and CONVERT(DATE, TaPagoFechaVencimiento) = CONVERT(DATE, @NuevoVencimiento);
            SET @NuevoVencimiento = @ultima_fecha_amortizacion
        END

    --VALIDACION DE SALDO VENCIDO
    DECLARE @Bloquear_Saldo_Vencido BIT = 0
    DECLARE @SaldoVencido FLOAT = 0

    IF @Bloqueado_Saldo_Vencido = 1 AND @EstadoDispositivoBase <> 'ROBADO'
        BEGIN
            -- CALCULO DE SALDO VENCIDO
            SELECT @SaldoVencido = vwSC.SaldoVencido
            FROM [dbo].[vw_POS_SaldosCredito] AS vwSC WITH (NOLOCK)
            WHERE vwSC.ClaveSolicitud = @ClaveSolicitud

            SET @Bloquear_Saldo_Vencido = ( CASE WHEN @SaldoVencido > 0.10 THEN 1 ELSE 0 END )
        END
    update dbo.SOF_SfcVentasSoftcredito
    set VsAccion               =    CASE WHEN @Bloqueado_Saldo_Vencido = 1 THEN  -- Se valida si aplica bloqueo por saldo vencido
                                             CASE WHEN @Bloquear_Saldo_Vencido = 1 AND @EstadoDispositivoBase = 'ACTIVO' THEN 'BLOQUEAR'
                                                  ELSE
                                                      CASE WHEN @EstadoDispositivoBase = 'ROBADO' THEN 'SIN CAMBIO' -- Asegurar que el robado no se mueva
                                                           WHEN @Bloquear_Saldo_Vencido = 1 AND @EstadoDispositivoBase = 'BLOQUEADO' THEN 'SIN CAMBIO'
                                                           WHEN @Bloquear_Saldo_Vencido = 0  THEN 'ACTIVAR' -- En caso de que no se tenga saldo vencido, se indica
                                                           ELSE @AccionBase END
                                                 END
                                         ELSE
                                             CASE WHEN @AccionBase = 'BLOQUEAR' AND @EstadoDispositivoBase <> 'ROBADO' THEN 'ACTIVAR'
                                               ELSE
                                                      CASE
                                                          WHEN @EstadoDispositivoBase = 'ROBADO' THEN 'SIN CAMBIO' -- Asegurar que el robado no se mueva
                                                          WHEN @EstadoDispositivoBase = 'BLOQUEADO' AND @SemanasPagadas > 0 THEN 'ACTIVAR'
                                                          WHEN @EstadoDispositivoBase = 'BLOQUEADO' AND @EsParcial IN (0,1) THEN 'ACTIVAR'
                                                          WHEN @EstadoDispositivoBase = 'ACTIVO' AND @SemanasPagadas > 0 THEN 'SIN CAMBIO'
                                                          WHEN @EstadoDispositivoBase = 'ACTIVO' AND @EsParcial IN (0,1) THEN 'SIN CAMBIO'
                                                          ELSE @AccionBase
                                                          END
                                                 END
        END

      , VsEstadoDispositivo =   CASE WHEN @AccionBase = 'BLOQUEAR' AND @EstadoDispositivoBase <> 'ROBADO' THEN
                                          'BLOQUEADO'
                                      ELSE
                                          VsEstadoDispositivo
        END
      , VsFechaAccion         = GETDATE()
      , VsFechaVigencia       = CASE WHEN @NuevoVencimiento > @FechaVigencia THEN @NuevoVencimiento ELSE @FechaVigencia END
      , UsuarioModificacion = @usuario
      , FechaModificacion   = GETDATE()
    where ClaveSolicitud = @ClaveSolicitud
      and VsStatus = 1
      and isnull(FechaModificacion, @FechaPago) = isnull(@FechaModificacion, @FechaPago)

    IF @@ROWCOUNT <= 0
        BEGIN
            select @FechaModificacionBase = FechaModificacion
            from dbo.SOF_SfcVentasSoftcredito WITH (NOLOCK)
            where ClaveSolicitud = @ClaveSolicitud
              and VsStatus = 1

            IF @FechaModificacion <> @FechaModificacionBase
                BEGIN
                    SET @mensaje = CONCAT('Error al actualizar el estatus de la venta de la solicitud ',@ClaveSolicitud, ', el registro fue modificado por otra aplicacion');
                    THROW 51000, @mensaje, 3;
                END
        END

    -- Actualizar la variable @AccionActivar
    SET @AccionActivar = CASE
                             WHEN (SELECT VsAccion FROM dbo.SOF_SfcVentasSoftcredito WHERE ClaveSolicitud = @ClaveSolicitud AND VsStatus = 1) = 'ACTIVAR' THEN 1
                             ELSE 0
        END;

    IF (@AccionActivar = 1)
        BEGIN
            -- VALIDACION DE IMEI_AVAL PF
            IF (@FgPf = 1)
                BEGIN
                    SELECT
                        @ImeiAval = CASE
                                        WHEN svs.FgAutoenrolable = 0 THEN mvd.ImeiDispositivo
                                        ELSE svs.VsImeiDispositivo
                            END
                    FROM dbo.SOF_SfcVentasSoftcredito svs WITH (NOLOCK)
                             LEFT JOIN dbo.SOF_MpfVentasDispositivo mvd WITH (NOLOCK) ON mvd.ClaveSolicitud = svs.ClaveSolicitud
                    WHERE svs.ClaveSolicitud = @ClaveSolicitud
                END

            -- VALIDACION DE SL AVAL
            SET @TieneAvalMpf = (SELECT COUNT(svs.ClaveSolicitud) FROM dbo.SOF_SfcVentasSoftcredito svs WITH (NOLOCK)
                                 WHERE svs.VsImeiDispositivo = @ImeiAval AND svs.ClaveSolicitud <> @ClaveSolicitud AND svs.FgProductosFinancieros = 0
                                   AND svs.VsEstadoDispositivo IN ('ACTIVO', 'BLOQUEADO', 'GARANTIA') AND svs.VsStatus IN (1, 4))

            IF (@TieneAvalMpf > 0)
                BEGIN
                    SET @CveSolicitudAval = (SELECT svs.ClaveSolicitud FROM dbo.SOF_SfcVentasSoftcredito svs WITH (NOLOCK)
                                             WHERE svs.VsImeiDispositivo = @ImeiAval AND svs.ClaveSolicitud <> @ClaveSolicitud AND svs.FgProductosFinancieros = 0
                                               AND svs.VsEstadoDispositivo IN ('ACTIVO', 'BLOQUEADO', 'GARANTIA') AND svs.VsStatus IN (1, 4))
                END
            ELSE BEGIN
                SET @TieneAvalPf = (select COUNT(svs.ClaveSolicitud) FROM dbo.SOF_SfcVentasSoftcredito svs WITH (NOLOCK)
                                                                              LEFT JOIN dbo.SOF_MpfVentasDispositivo mvd WITH (NOLOCK) ON svs.ClaveSolicitud = mvd.ClaveSolicitud
                                    WHERE
                                        CASE
                                            WHEN svs.FgAutoenrolable = 0 THEN mvd.ImeiDispositivo
                                            ELSE svs.VsImeiDispositivo
                                            END = @ImeiAval AND svs.ClaveSolicitud <> @ClaveSolicitud AND svs.FgProductosFinancieros = 1
                                      AND svs.VsEstadoDispositivo IN ('ACTIVO', 'BLOQUEADO', 'GARANTIA') AND svs.VsStatus IN (1, 4))
            END

            IF (@TieneAvalPf > 0)
                BEGIN
                    SET @CveSolicitudAval = (SELECT svs.ClaveSolicitud FROM dbo.SOF_SfcVentasSoftcredito svs WITH (NOLOCK)
                                                                                LEFT JOIN dbo.SOF_MpfVentasDispositivo mvd WITH (NOLOCK) ON svs.ClaveSolicitud = mvd.ClaveSolicitud
                                             WHERE
                                                 CASE
                                                     WHEN svs.FgAutoenrolable = 0 THEN mvd.ImeiDispositivo
                                                     ELSE svs.VsImeiDispositivo
                                                     END = @ImeiAval AND svs.ClaveSolicitud <> @ClaveSolicitud
                                               AND svs.VsEstadoDispositivo IN ('ACTIVO', 'BLOQUEADO', 'GARANTIA') AND svs.VsStatus IN (1, 4))
                END

            IF (@CveSolicitudAval <> 'HOLANOSOYSL')
                BEGIN
                    IF EXISTS (SELECT vwSC.FechaVencimiento FROM [dbo].[vw_POS_SaldosCredito] AS vwSC WITH (NOLOCK) WHERE vwSC.ClaveSolicitud IN (@ClaveSolicitud, @CveSolicitudAval) AND vwSC.FechaVencimiento < @FechaPago)
                        BEGIN
                            UPDATE dbo.SOF_SfcVentasSoftcredito
                            SET VsAccion = 'SIN CAMBIO',
                                VsFechaAccion = GETDATE(),
                                FechaModificacion = GETDATE(),
                                UsuarioModificacion = @usuario
                            FROM dbo.SOF_SfcVentasSoftcredito svs
                            WHERE svs.ClaveSolicitud IN (@ClaveSolicitud, @CveSolicitudAval)
                        END
                    ELSE BEGIN
                        IF EXISTS (SELECT svs.ClaveSolicitud FROM dbo.SOF_SfcVentasSoftcredito svs WITH (NOLOCK) WHERE svs.ClaveSolicitud IN (@ClaveSolicitud, @CveSolicitudAval) AND svs.VsEstadoDispositivo IN ('GARANTIA'))
                            BEGIN
                                UPDATE dbo.SOF_SfcVentasSoftcredito
                                SET VsAccion = 'SIN CAMBIO',
                                    VsFechaAccion = GETDATE(),
                                    FechaModificacion = GETDATE(),
                                    UsuarioModificacion = @usuario
                                FROM dbo.SOF_SfcVentasSoftcredito svs
                                WHERE svs.ClaveSolicitud IN (@ClaveSolicitud, @CveSolicitudAval)
                            END
                        ELSE BEGIN
                            UPDATE dbo.SOF_SfcVentasSoftcredito
                            SET VsAccion = 'ACTIVAR',
                                VsFechaAccion = GETDATE(),
                                FechaModificacion = GETDATE(),
                                UsuarioModificacion = @usuario
                            FROM dbo.SOF_SfcVentasSoftcredito svs
                            WHERE svs.ClaveSolicitud IN (@ClaveSolicitud, @CveSolicitudAval)
                        END
                    END
                END
        END

    INSERT INTO SOF_SfcLogAccionDispositivo (ClaveSolicitud
                                            , AccionDispositivo
                                            , FechaVencimientoDispositivo
                                            , UsuarioAlta,FechaAlta
                                            , AccionDispositivoActual
                                            , EstadoDispositivoActual
                                            , Vigencia)
    VALUES (    @ClaveSolicitud
           , CASE WHEN @EstadoDispositivoBase IN ('BLOQUEADO', 'ACTIVO') THEN 'ACTIVAR'
                  WHEN @EstadoDispositivoBase = 'ROBADO' THEN 'SIN CAMBIO'
                  ELSE @AccionBase
                    END
           , @NuevoVencimiento
           , @Usuario
           , GETDATE()
           , @AccionBase
           , @EstadoDispositivoBase
           , 1
           )

    -- LOG REPORTES MONITOREO SALDOS VENCIDOS
    INSERT INTO SOF_SfcLogBloqueoSdoVencCarga
    (
        TipoLog,
        ClaveSolicitud ,
        ImporteSaldoVencido ,
        AbonoRealizado ,
        FechaAlta ,
        EstadoDispositivoInicial ,
        NuevoEstadoDispositivo ,
        AccionDispositivoInicial ,
        NuevaAccionDispositivo ,
        Motivo ,
        Operador
    )
    SELECT
        2
         ,ventas.ClaveSolicitud
         ,@SaldoVencido
         ,@MontoAbono
         ,GETDATE()
         ,@EstadoDispositivoBase
         ,CASE WHEN ventas.VsAccion = 'BLOQUEAR' THEN 'BLOQUEADO'
               WHEN ventas.VsAccion = 'ACTIVAR' THEN 'ACTIVO'
               ELSE @EstadoDispositivoBase END
         ,@AccionBase
         ,ventas.VsAccion
         ,CASE WHEN ventas.VsAccion = 'BLOQUEAR' THEN 'BLOQUEADO POR SALDO VENCIDO'
               WHEN ventas.VsAccion = 'ACTIVAR' THEN 'ACTIVADO POR PAGO DE SALDO VENCIDO'
               ELSE 'SIN ACCION ABONO' END
         ,@usuario
    FROM dbo.SOF_SfcVentasSoftcredito AS ventas WITH (NOLOCK)
    WHERE ventas.VsStatus = 1
      AND ventas.ClaveSolicitud = @ClaveSolicitud
      AND ventas.VsBloqueoSaldoVencido = 1

    EXEC dbo.[usp_POS_MarcarCreditoLiberado] @ClaveSolicitud, @Usuario

    select  @ClaveSolicitud as clave_solicitud
         , round(@CapitalPagado, 5)  as capital_pagado
         , round(@InteresPagado, 5)  as interes_pagado
         , round(@MontoAbono, 5) as total_abonado
         , @SemanasPagadas as amortizaciones_pagadas
         , round(@GarantiaPagado, 5)  as garantia_pagado
         , round(@MembresiaPagado, 5)  as membresia_pagado
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK;

    DECLARE @ErrorNumber  int            = ERROR_NUMBER();
    DECLARE @ErrorMessage nvarchar(2048) = ERROR_MESSAGE();
    DECLARE @ErrorState   int            = ERROR_STATE();

    -- Validar que el número de error esté en el rango válido (50000-2147483647)
    -- Si es un error del sistema (<50000), usar 50000
    IF @ErrorNumber < 50000
        SET @ErrorNumber = 50000;

    THROW @ErrorNumber, @ErrorMessage, @ErrorState;
END CATCH
